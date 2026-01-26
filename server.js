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
        // Render 환경을 위한 Puppeteer 설정
        const browser = await puppeteer.launch({
            headless: true,
            // 환경 변수에 설정한 경로를 가져오거나, 없으면 기본 경로를 사용
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();

        // HSTS 대응: HTTPS 접속 및 데이터 로딩 대기
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Firebase 데이터(로그 요소)가 나타날 때까지 대기
        await page.waitForSelector('div[data-index]', { timeout: 30000 });

        // 데이터 추출
        const htmlContent = await page.evaluate(() => {
            // 채팅 로그 영역만 떼어내거나 전체를 가져올 수 있습니다.
            return document.body.innerHTML;
        });

        res.json({ success: true, html: htmlContent });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));