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

        // 3 & 4. 실시간 수집 로직 (순서 및 누락 보정)
        const chatLogs = await page.evaluate(async (selector) => {
            const list = document.querySelector(selector);
            let scrollBox = list;
            while (scrollBox) {
                if (window.getComputedStyle(scrollBox).overflowY === 'auto' ||
                    window.getComputedStyle(scrollBox).overflowY === 'scroll') break;
                scrollBox = scrollBox.parentElement;
            }
            if (!scrollBox) scrollBox = list?.parentElement;

            const allLogsMap = new Map();

            await new Promise((resolve) => {
                let sameCount = 0;
                const maxRetries = 25; // 수만 줄을 위해 대기 횟수 증가

                const timer = setInterval(() => {
                    // [수집] 아래에서 위로 올라가며 보이는 족족 맵에 담기
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

                            // 중복 방지 키 (이름+내용+이미지)
                            const key = `${name}_${message}_${image}`;
                            if (!allLogsMap.has(key)) {
                                // 맵은 삽입 순서를 기억합니다. (최신 -> 과거 순으로 쌓임)
                                allLogsMap.set(key, { name, message, image, nameColor });
                            }
                        }
                    });

                    const lastSize = allLogsMap.size;
                    scrollBox.scrollBy(0, -1200); // 위로 스크롤

                    if (scrollBox.scrollTop === 0) {
                        if (allLogsMap.size === lastSize) {
                            sameCount++;
                            if (sameCount >= maxRetries) {
                                clearInterval(timer);
                                resolve();
                            }
                        } else {
                            sameCount = 0;
                        }
                    }
                }, 700); // 0.7초 간격
            });

            // 수집된 데이터를 배열로 변환
            const finalLogs = Array.from(allLogsMap.values());
            // 아래(최근)에서 위(과거)로 수집했으므로, 
            // 원래 시간순(과거 -> 최근)으로 보려면 배열을 뒤집어야 합니다.
            return finalLogs.reverse();
        }, chatContainerSelector);

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