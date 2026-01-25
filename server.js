const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// 모든 도메인에서의 접속을 허용합니다. (GitHub Pages 연동용)
app.use(cors());

app.get('/proxy/:roomId', async (req, res) => {
    const { roomId } = req.params;

    // 서버 깨우기 확인용 테스트 경로
    if (roomId === 'test') return res.json({ status: 'ok' });

    const targetUrl = `https://ccfolia.com/api/room/${roomId}`;

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                // 실제 브라우저인 것처럼 속이는 핵심 헤더 세트
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': `https://ccfolia.com/rooms/${roomId}`,
                'Origin': 'https://ccfolia.com',
                
                // Sec- 계열 헤더: 최신 크롬 보안 검사 우회용
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000 // 10초 내 응답 없으면 타임아웃
        });

        // 성공적으로 JSON 데이터를 받았을 경우
        if (response.data && response.data.data) {
            res.json(response.data);
        } else {
            res.status(404).json({ error: "데이터 형식이 올바르지 않거나 방이 비공개입니다." });
        }
    } catch (error) {
        console.error("Fetch Error:", error.message);
        
        // 코코포리아가 차단(HTML 응답)을 보냈을 때의 처리
        if (error.response && typeof error.response.data === 'string' && error.response.data.includes('<!doctype html>')) {
            res.status(403).json({ error: "코코포리아가 서버 접근을 거부했습니다. (봇 방어 작동)" });
        } else {
            res.status(500).json({ error: "코코포리아 서버에 연결할 수 없습니다." });
        }
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));