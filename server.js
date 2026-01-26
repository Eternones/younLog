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

        // 3. 모든 로그를 불러오기 위해 가장 위로 스크롤 (개선된 단일 로직)
        await page.evaluate(async (selector) => {
            const container = document.querySelector(selector)?.parentElement;
            if (!container) return;

            await new Promise((resolve) => {
                let previousHeight = 0;
                let retryCount = 0;
                const maxRetries = 5; 

                const timer = setInterval(() => {
                    container.scrollBy(0, -1200); // 위로 스크롤

                    const currentHeight = document.querySelectorAll('.MuiListItem-root').length;

                    if (container.scrollTop === 0) {
                        if (currentHeight === previousHeight) {
                            retryCount++;
                            if (retryCount >= maxRetries) {
                                clearInterval(timer);
                                resolve();
                            }
                        } else {
                            retryCount = 0;
                        }
                    }
                    previousHeight = currentHeight;
                }, 500); 
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