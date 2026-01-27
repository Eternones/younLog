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

        // 3 & 4. 스크롤 덩어리 수집 및 역순 재조합 로직
        const chatLogs = await page.evaluate(async (selector) => {
            const list = document.querySelector(selector);
            let scrollBox = list?.closest('.MuiPaper-root') || list?.parentElement;
            if (!scrollBox) return [];

            const chunks = []; // 각 스크롤 시점의 로그 뭉치들을 담을 배열
            const seenKeys = new Set(); // 전체 중복 체크용

            await new Promise((resolve) => {
                let sameCount = 0;
                const maxRetries = 20;

                const timer = setInterval(() => {
                    const currentItems = document.querySelectorAll('.MuiListItem-root');
                    const currentChunk = [];

                    // 1. 현재 화면에 보이는 로그들을 하나의 덩어리로 수집
                    currentItems.forEach(item => {
                        const nameEl = item.querySelector('h6');
                        const msgEl = item.querySelector('p');
                        const imgEl = item.querySelector('img');

                        if (nameEl && msgEl) {
                            const name = nameEl.innerText.trim();
                            const message = msgEl.innerText.trim();
                            const image = imgEl ? imgEl.src : null;
                            const nameColor = window.getComputedStyle(nameEl).color;

                            const key = `${name}_${message}_${image}`;
                            // 중복되지 않은 새로운 로그만 이번 덩어리에 추가
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key);
                                currentChunk.push({ name, message, image, nameColor });
                            }
                        }
                    });

                    // 이번 스크롤에서 새로 발견된 로그가 있다면 덩어리에 추가
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        sameCount = 0; // 데이터가 들어왔으므로 카운트 초기화
                    }

                    // 2. 위로 스크롤
                    scrollBox.scrollBy(0, -1200);

                    // 3. 종료 조건 (맨 위 도달 및 데이터 정체)
                    if (scrollBox.scrollTop === 0) {
                        sameCount++;
                        if (sameCount >= maxRetries) {
                            clearInterval(timer);
                            resolve();
                        }
                    }
                }, 800);
            });

            // chunks 구조: [[최신로그들], [그다음로그들], ..., [가장오래된로그들]]
            // 1. 각 덩어리 내부의 순서도 위로 갈수록 과거이므로 뒤집어줍니다.
            const processedChunks = chunks.map(chunk => chunk.reverse());

            // 2. 덩어리 배열 자체를 뒤집어서 [가장오래된] -> [최신] 순서로 만듭니다.
            processedChunks.reverse();

            // 3. 모든 덩어리를 하나의 평평한 배열로 합칩니다.
            return processedChunks.flat();
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