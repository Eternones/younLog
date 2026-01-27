const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 서버 깨우기용 기본 경로
app.get('/', (req, res) => res.send('Server is awake!'));

app.post('/extract', async (req, res) => {
    const { url } = req.body;

    if (!url || !url.startsWith('https://ccfolia.com')) {
        return res.status(400).json({ success: false, error: '유효한 코코포리아 URL이 아닙니다.' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();

        // 1. 페이지 접속 (타임아웃 넉넉히 2분)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

        const chatContainerSelector = '.MuiList-root';

        // 2. 채팅창 요소 대기
        await page.waitForSelector(chatContainerSelector, { timeout: 30000 }).catch(() => {
            console.log("선택자를 찾지 못했지만 진행합니다.");
        });

        // 3 & 4. 실시간 수집 및 스크롤 로직 (수만 줄 대응 끝판왕)
        const chatLogs = await page.evaluate(async (selector) => {
            const list = document.querySelector(selector);
            // 실제 스크롤이 발생하는 부모 요소를 찾습니다.
            let scrollBox = list;
            while (scrollBox) {
                if (window.getComputedStyle(scrollBox).overflowY === 'auto' ||
                    window.getComputedStyle(scrollBox).overflowY === 'scroll') break;
                scrollBox = scrollBox.parentElement;
            }
            if (!scrollBox) scrollBox = list?.parentElement;

            const allLogsMap = new Map(); // 중복 제거를 위한 맵

            await new Promise((resolve) => {
                let sameCount = 0;
                const maxRetries = 20; // 로딩 대기 횟수 (넉넉히)

                const timer = setInterval(() => {
                    // [수집] 현재 화면에 보이는 아이템들을 즉시 맵에 저장 (중복 자동 제거)
                    const items = document.querySelectorAll('.MuiListItem-root');
                    items.forEach(item => {
                        const nameEl = item.querySelector('h6');
                        const msgEl = item.querySelector('p');
                        const imgEl = item.querySelector('img');

                        if (nameEl && msgEl) {
                            const name = nameEl.innerText.trim();
                            const message = msgEl.innerText.trim();
                            const image = imgEl ? imgEl.src : null;
                            const nameColor = window.getComputedStyle(nameEl).color;

                            // 이름+메시지+이미지 조합을 키로 사용
                            const key = `${name}_${message}_${image}`;
                            if (!allLogsMap.has(key)) {
                                allLogsMap.set(key, { name, message, image, nameColor });
                            }
                        }
                    });

                    // [스크롤] 맨 위로 강제 이동하여 새 데이터 트리거
                    const lastCount = allLogsMap.size;
                    scrollBox.scrollTo(0, 0);

                    // [종료 체크] 맨 위에서 데이터가 더 이상 늘어나지 않는지 확인
                    if (scrollBox.scrollTop === 0) {
                        // 실제 Map의 사이즈가 변했는지로 데이터 추가 여부 판단
                        if (allLogsMap.size === lastCount) {
                            sameCount++;
                            if (sameCount >= maxRetries) {
                                clearInterval(timer);
                                resolve();
                            }
                        } else {
                            sameCount = 0; // 새 데이터가 들어왔으면 카운트 초기화
                        }
                    }
                }, 800); // 0.8초 간격으로 반복
            });

            // 수집된 Map을 배열로 변환하여 반환
            return Array.from(allLogsMap.values());
        }, chatContainerSelector);

        // 결과 응답 (추출 로직이 위에서 끝났으므로 바로 전송)
        res.json({ success: true, logs: chatLogs });

    } catch (error) {
        console.error("추출 중 에러 발생:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));