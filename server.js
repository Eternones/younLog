const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// 모든 접속을 허용하거나, 내 GitHub Pages 주소만 허용하도록 설정합니다.
app.use(cors()); 

app.get('/proxy/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const targetUrl = `https://ccfolia.com/api/room/${roomId}`;

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://ccfolia.com/',
                'Origin': 'https://ccfolia.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error.message);
        res.status(500).json({ error: "코코포리아에서 데이터를 가져오지 못했습니다." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));