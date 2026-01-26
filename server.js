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
        // 3. 모든 로그를 불러오기 위해 가장 위로 스크롤 (강화된 로직)
        await page.evaluate(async (selector) => {
            const container = document.querySelector(selector)?.parentElement;
            if (!container) return;

            await new Promise((resolve) => {
                let lastHeight = document.querySelectorAll('.MuiListItem-root').length;
                let retryCount = 0;
                const maxRetries = 10; // 데이터가 안 늘어나도 10번(약 8초)은 더 시도해봄

                const timer = setInterval(() => {
                    // 1. 위로 스크롤
                    container.scrollBy(0, -1500);

                    // 2. 현재 로드된 채팅 아이템 개수 확인
                    const currentHeight = document.querySelectorAll('.MuiListItem-root').length;

                    // 3. 맨 위(scrollTop 0)에 도달했는지 확인
                    if (container.scrollTop === 0) {
                        if (currentHeight === lastHeight) {
                            // 맨 위인데 개수가 그대로라면 '로딩 대기' 모드 진입
                            retryCount++;
                            console.log(`데이터 로딩 대기 중... (${retryCount}/${maxRetries})`);

                            if (retryCount >= maxRetries) {
                                // 충분히 기다렸는데도 변화가 없으면 진짜 끝으로 간주
                                clearInterval(timer);
                                resolve();
                            }
                        } else {
                            // 데이터가 늘어났다면 로딩 성공! 다시 카운트 초기화하고 계속 올라감
                            retryCount = 0;
                        }
                    } else {
                        // 아직 맨 위가 아니면 계속 스크롤 (이때도 카운트 초기화)
                        retryCount = 0;
                    }

                    lastHeight = currentHeight;
                }, 800); // 0.8초마다 한 번씩 스크롤 (로딩 시간을 넉넉히 줌)
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