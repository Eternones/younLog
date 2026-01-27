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

        // 3. 모든 로그를 불러오기 위해 가장 위로 스크롤 (완전 강화판)
        await page.evaluate(async (selector) => {
            // 채팅 목록 요소를 먼저 찾습니다.
            const list = document.querySelector(selector);
            if (!list) return;

            // 실제로 스크롤바가 있는 부모 요소를 찾습니다. (가장 중요)
            let container = list;
            while (container) {
                if (window.getComputedStyle(container).overflowY === 'auto' ||
                    window.getComputedStyle(container).overflowY === 'scroll') {
                    break;
                }
                container = container.parentElement;
            }

            if (!container) container = list.parentElement; // 못 찾으면 직계 부모라도 지정

            await new Promise((resolve) => {
                let lastItemCount = 0;
                let sameCount = 0;
                const maxRetries = 15; // 로딩 대기 횟수 대폭 증가

                const timer = setInterval(() => {
                    // 맨 위로 강제 이동 (scrollTop을 0으로 고정 시도)
                    container.scrollTo(0, 0);
                    container.scrollBy(0, -500); // 추가로 위로 밀기

                    const currentItems = document.querySelectorAll('.MuiListItem-root').length;

                    // 데이터가 늘어났는지 확인
                    if (currentItems === lastItemCount) {
                        sameCount++;
                        // 맨 위인데 데이터가 안 늘어난다면? (더 기다려봄)
                        if (sameCount >= maxRetries) {
                            clearInterval(timer);
                            resolve();
                        }
                    } else {
                        // 데이터가 늘어났다면! 다시 대기 카운트 초기화
                        sameCount = 0;
                        lastItemCount = currentItems;
                    }
                }, 1000); // 로딩 시간을 1초로 넉넉히 줌
            });
        }, chatContainerSelector);

        // 4. 데이터 추출
        const chatLogs = await page.evaluate(() => {
            const items = document.querySelectorAll('.MuiListItem-root');

            return Array.from(items).map(item => {
                const nameElement = item.querySelector('h6');
                const messageElement = item.querySelector('p');
                const imageElement = item.querySelector('img');

                if (nameElement && messageElement) {
                    return {
                        name: nameElement.innerText.trim(),
                        message: messageElement.innerText.trim(),
                        image: imageElement ? imageElement.src : null,
                        nameColor: window.getComputedStyle(nameElement).color
                    };
                }
                return null;
            }).filter(log => log !== null);
        });

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