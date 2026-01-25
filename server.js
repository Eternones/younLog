const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/proxy/:roomId', async (req, res) => {
    const { roomId } = req.params;
    
    // 테스트용 경로 처리
    if (roomId === 'test') return res.json({ status: 'ok' });

    const targetUrl = `https://ccfolia.com/api/room/${roomId}`;

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ccfolia.com/'
            }
        });
        
        // 데이터 구조가 올바른지 확인 후 전송
        if (response.data && response.data.data) {
            res.json(response.data);
        } else {
            res.status(404).json({ error: "방 정보를 찾을 수 없거나 비공개 상태입니다." });
        }
    } catch (error) {
        console.error("Fetch Error:", error.message);
        res.status(500).json({ error: "코코포리아 서버 응답 오류" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));