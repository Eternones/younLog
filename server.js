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
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Firebase 데이터(로그 요소)가 나타날 때까지 대기
        await page.waitForSelector('div[data-index]', { timeout: 30000 });

        // server.js 의 추출 로직 부분 수정
        const chatLogs = await page.evaluate(() => {
            const items = document.querySelectorAll('.MuiListItem-root');

            return Array.from(items).map(item => {
                const nameElement = item.querySelector('h6');
                const messageElement = item.querySelector('p');
                const imageElement = item.querySelector('img');

                if (nameElement && messageElement) {
                    const name = nameElement.innerText.split('-')[0].trim();
                    const message = messageElement.innerText.trim();
                    const imageUrl = imageElement ? imageElement.src : null;

                    // [수정] h6(이름) 요소의 글자색을 정확히 가져옵니다.
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