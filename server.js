const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

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
            // [중요] 프로토콜 타임아웃을 해제(0)하거나 아주 길게 설정
            protocolTimeout: 0,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        // 전체 작업 타임아웃 해제 (무제한)
        page.setDefaultTimeout(0);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

        const chatContainerSelector = '.MuiList-root';
        await page.waitForSelector(chatContainerSelector, { timeout: 60000 }).catch(() => console.log("진행함"));

        // === [최적화된 로직 시작] ===
        // 브라우저 내부가 아니라 Node.js에서 루프를 제어합니다.

        const allLogsMap = new Map(); // 전체 로그 저장소 (Node.js 메모리)
        let isFinished = false;
        let noChangeCount = 0;
        const maxRetries = 30; // 멈춘 상태에서 약 30초 대기

        while (!isFinished) {
            // 1. 브라우저에게 "현재 화면 긁고 스크롤 올려" 명령 (짧게 실행됨)
            const result = await page.evaluate((selector) => {
                const list = document.querySelector(selector);
                let scrollBox = list;
                while (scrollBox) {
                    const style = window.getComputedStyle(scrollBox);
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
                    scrollBox = scrollBox.parentElement;
                }
                if (!scrollBox) scrollBox = list?.parentElement;

                // 데이터 수집
                const items = document.querySelectorAll('.MuiListItem-root');
                const chunk = [];
                items.forEach(item => {
                    const nameEl = item.querySelector('h6');
                    const msgEl = item.querySelector('p');
                    const imgEl = item.querySelector('img');

                    if (nameEl && msgEl) {
                        chunk.push({
                            name: nameEl.innerText.trim(),
                            message: msgEl.innerText.trim(),
                            image: imgEl ? imgEl.src : null,
                            nameColor: window.getComputedStyle(nameEl).color
                        });
                    }
                });

                // 스크롤 올리기
                const prevScrollTop = scrollBox.scrollTop;
                scrollBox.scrollBy(0, -2000);

                return {
                    chunk,
                    scrollTop: scrollBox.scrollTop,
                    isTop: scrollBox.scrollTop === 0
                };
            }, chatContainerSelector);

            // 2. 받아온 데이터를 Node.js의 Map에 저장 (중복 제거)
            let newLogAdded = false;
            // 역순으로 훑어서 저장 (최신 -> 과거 순으로 들어오므로)
            for (const log of result.chunk) {
                const key = `${log.name}_${log.message}_${log.image}`;
                if (!allLogsMap.has(key)) {
                    allLogsMap.set(key, log);
                    newLogAdded = true;
                }
            }

            // 3. 종료 조건 판단
            // 맨 위에 도달했고, 새로운 데이터도 없다면 카운트 증가
            if (result.isTop && !newLogAdded) {
                noChangeCount++;
                console.log(`수집 대기 중... (${noChangeCount}/${maxRetries})`);

                if (noChangeCount >= maxRetries) {
                    isFinished = true;
                }
            } else {
                // 데이터가 추가됐거나 아직 스크롤이 남았다면 카운트 리셋
                if (newLogAdded) noChangeCount = 0;
                process.stdout.write(`수집 중... 현재 ${allLogsMap.size}개 \r`); // 진행상황 표시
            }

            // 4. Node.js 측에서 잠시 대기 (브라우저 과부하 방지 및 로딩 시간 벌기)
            await new Promise(r => setTimeout(r, 800));
        }

        // 5. 결과 정리
        // 수집은 [최신 -> 과거] 순으로 섞여서 되었으므로,
        // Map은 삽입 순서를 유지하되, 우리는 스크롤을 올리며 수집했으므로
        // 결과적으로 allLogsMap.values()는 [최신 ... 과거]가 섞여있을 수 있음.
        // 하지만 "덩어리" 단위 처리가 아니라 전체 맵이므로
        // 단순히 뒤집는 게 아니라, 논리적으로 정렬이 필요할 수 있으나,
        // 코코포리아 특성상 스크롤 역순 수집이므로 .reverse()가 가장 적합함.

        const finalLogs = Array.from(allLogsMap.values()).reverse();

        console.log(`총 ${finalLogs.length}개의 로그 추출 완료`);
        res.json({ success: true, logs: finalLogs });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));