const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 서버 깨우기
app.get('/', (req, res) => res.send('Server is awake!'));

app.post('/extract', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.startsWith('https://ccfolia.com')) {
        return res.status(400).json({ success: false, error: '유효한 URL이 아닙니다.' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
            protocolTimeout: 0, // 타임아웃 무제한 (필수)
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(0); // 페이지 타임아웃 무제한

        // 1. 페이지 접속
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

        const chatContainerSelector = '.MuiList-root';
        await page.waitForSelector(chatContainerSelector, { timeout: 60000 }).catch(() => console.log("진행함"));

        // 2. 고속 수집 루프 시작
        const allLogsMap = new Map();
        let isFinished = false;
        let noChangeCount = 0;
        const maxRetries = 20; // 데이터 끝 도달 판단 횟수
        let lastMapSize = 0;

        console.log("수집 시작...");

        while (!isFinished) {
            // 브라우저에게 "수집하고 스크롤 올려" 명령
            const result = await page.evaluate((selector) => {
                const list = document.querySelector(selector);
                let scrollBox = list;
                while (scrollBox) {
                    const style = window.getComputedStyle(scrollBox);
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
                    scrollBox = scrollBox.parentElement;
                }
                if (!scrollBox) scrollBox = list?.parentElement;

                if (!scrollBox) return { chunk: [], isTop: true };

                // 데이터 수집 (DOM 접근 최소화)
                const items = document.querySelectorAll('.MuiListItem-root');
                const chunk = [];
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const nameEl = item.querySelector('h6');
                    const msgEl = item.querySelector('p');
                    
                    if (nameEl && msgEl) {
                        chunk.push({
                            name: nameEl.innerText.trim(),
                            message: msgEl.innerText.trim(),
                            image: item.querySelector('img')?.src || null,
                            nameColor: window.getComputedStyle(nameEl).color
                        });
                    }
                }

                // [최적화] 스크롤 보폭을 -4000으로 대폭 확대
                const prevScroll = scrollBox.scrollTop;
                scrollBox.scrollBy(0, -4000);
                
                return {
                    chunk,
                    isTop: scrollBox.scrollTop === 0
                };
            }, chatContainerSelector);

            // Node.js에서 중복 제거 및 저장
            for (const log of result.chunk) {
                const key = `${log.name}_${log.message}_${log.image}`;
                if (!allLogsMap.has(key)) {
                    allLogsMap.set(key, log);
                }
            }

            // [최적화 핵심] 속도 조절 로직
            const currentSize = allLogsMap.size;
            if (currentSize > lastMapSize) {
                // 데이터가 새로 들어왔다면? -> 물 들어올 때 노 저어야 함!
                // 대기 시간을 0.1초로 확 줄여서 바로 다음 스크롤 진행
                noChangeCount = 0;
                lastMapSize = currentSize;
                await new Promise(r => setTimeout(r, 100)); 
            } else {
                // 데이터가 안 들어왔다면? -> 로딩 중이거나 끝임
                // 0.5초 대기하며 재시도
                noChangeCount++;
                await new Promise(r => setTimeout(r, 500));
            }

            // 진행 상황 로그 (Render 콘솔에서 확인 가능)
            if (currentSize % 500 === 0) {
                console.log(`현재 ${currentSize}줄 수집 중... (상태: ${result.isTop ? '맨 위 도달' : '스크롤 중'})`);
            }

            // 종료 조건: 맨 위에 도달했고, 20번(약 10초) 동안 새 데이터가 없으면 끝
            if (result.isTop && noChangeCount >= maxRetries) {
                console.log("수집 완료!");
                isFinished = true;
            }
        }

        // 3. 결과 반환 (역순 정렬)
        const finalLogs = Array.from(allLogsMap.values()).reverse();
        res.json({ success: true, logs: finalLogs });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));