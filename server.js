const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

app.use(cors());

app.get('/proxy/:roomId', async (req, res) => {
    const { roomId } = req.params;
    
    // 무작위 User-Agent 선택
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
        const response = await axios.get(`https://ccfolia.com/api/room/${roomId}`, {
            headers: {
                'User-Agent': randomUA,
                'Accept': 'application/json',
                'Referer': 'https://ccfolia.com/',
                // 아래 항목을 추가하면 더 효과적입니다.
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        // 코코포리아 API는 성공 시 { data: { ... } } 구조를 가집니다.
        if (response.data && response.data.data) {
            res.json(response.data);
        } else {
            // 응답은 왔으나 데이터가 비어있는 경우
            res.status(404).json({ error: "방이 비공개이거나 삭제되었습니다." });
        }
    } catch (error) {
        console.error("Fetch Error:", error.response ? error.response.status : error.message);
        
        // 403이나 404 에러 시 사용자에게 알림
        if (error.response && error.response.status === 403) {
            res.status(403).json({ error: "코코포리아가 접근을 차단했습니다. 잠시 후 다시 시도하세요." });
        } else {
            res.status(500).json({ error: "서버 응답 오류 (방 ID를 확인해주세요)" });
        }
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));