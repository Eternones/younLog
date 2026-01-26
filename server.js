const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();


app.use(cors()); // GitHub Pages에서 접근할 수 있도록 허용
app.use(express.json());

app.post('/extract', async (req, res) => {
    const { url } = req.body;

    if (!url || !url.startsWith('https://ccfolia.com')) {
        return res.status(400).send('유효한 코코포리아 URL이 아닙니다.');
    }

    let browser;
    try {
        // server.js의 puppeteer.launch 부분
        const browser = await puppeteer.launch({
            headless: true, // 또는 'new'
            // executablePath 항목을 아예 삭제하거나 아래처럼 puppeteer.executablePath()를 사용하세요.
            executablePath: puppeteer.executablePath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();

        // HSTS 대응: HTTPS 접속 및 데이터 로딩 대기
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

        // 2. 채팅창 요소가 나타날 때까지 대기
        const chatContainerSelector = '.MuiList-root';
        await page.waitForSelector(chatContainerSelector, { timeout: 20000 });

        // 3. 모든 로그를 불러오기 위해 가장 위로 스크롤 (개선된 로직)
        await page.evaluate(async (selector) => {
            const container = document.querySelector(selector)?.parentElement;
            if (!container) return;

            await new Promise((resolve) => {
                let previousHeight = 0;
                let retryCount = 0;
                const maxRetries = 5; // 데이터 로딩을 위해 최대 5번까지 더 확인

                const timer = setInterval(() => {
                    container.scrollBy(0, -1000); // 위로 크게 스크롤

                    // 현재 리스트의 전체 높이(아이템 개수와 관련) 확인
                    const currentHeight = document.querySelectorAll('.MuiListItem-root').length;

                    // 맨 위(scrollTop 0)에 도달했는지 확인
                    if (container.scrollTop === 0) {
                        // 맨 위인데 데이터 개수도 그대로라면? (진짜 끝인지 확인)
                        if (currentHeight === previousHeight) {
                            retryCount++;
                            if (retryCount >= maxRetries) {
                                clearInterval(timer);
                                resolve();
                            }
                        } else {
                            // 데이터가 새로 로딩되었다면 다시 카운트 초기화
                            retryCount = 0;
                        }
                    }
                    previousHeight = currentHeight;
                }, 500); // 로딩 속도를 고려해 0.5초 간격으로 조정
            });
        }, chatContainerSelector);

        // server.js 의 추출 로직 부분 수정
        const chatLogs = await page.evaluate(() => {
            const items = document.querySelectorAll('.MuiListItem-root');

            return Array.from(items).map(item => {
                const nameElement = item.querySelector('h6');
                const messageElement = item.querySelector('p');
                const imageElement = item.querySelector('img');

                if (nameElement && messageElement) {
                    const name = nameElement.innerText.trim();
                    const message = messageElement.innerText.trim();
                    const imageUrl = imageElement ? imageElement.src : null;
                    const nameColor = window.getComputedStyle(nameElement).color;

                    return {
                        name: name,
                        message: message,
                        image: imageUrl,
                        nameColor: nameColor // 이름 색상만 별도로 저장
                    };
                }
                return null;
            }).filter(log => log !== null);
        });

        res.json({ success: true, logs: chatLogs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 10000; // Render는 10000 포트를 기본으로 씁니다.
app.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));