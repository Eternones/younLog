const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/proxy/:roomId', async (req, res) => {
    const { roomId } = req.params;
    if (roomId === 'test') return res.json({ status: 'ok' });

    const targetUrl = `https://ccfolia.com/api/room/${roomId}`;

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                // 실제 사용자가 브라우저로 접속하는 것처럼 보이게 만듭니다.
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': `https://ccfolia.com/rooms/${roomId}`,
                'Origin': 'https://ccfolia.com',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            },
            timeout: 10000 // 10초 내 응답 없으면 중단
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