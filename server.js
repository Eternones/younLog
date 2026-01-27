// [수정] require 방식으로 통일
const config = require("./apikey.js"); 

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const CONFIG = {
    apiKey: config.apiKey,
    projectId: config.projectId
};

app.post('/extract-direct', async (req, res) => {
    const { url } = req.body; 
    
    try {
        const roomId = url.split('/').pop();
        if (!roomId) throw new Error("URL에서 방 ID를 찾을 수 없습니다.");

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents:runQuery?key=${CONFIG.apiKey}`;
        
        const response = await axios.post(firestoreUrl, {
            structuredQuery: {
                from: [{ collectionId: "messages" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "roomId" },
                        op: "EQUAL",
                        value: { stringValue: roomId }
                    }
                },
                // [정렬] ASCENDING은 '과거 -> 최신' (로그 스타일)
                // 만약 '최신 -> 과거'를 원하시면 DESCENDING으로 바꾸세요.
                orderBy: [
                    { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
                    { field: { fieldPath: "__name__" }, direction: "ASCENDING" }
                ]
            }
        });

        const rawData = response.data;
        if (!rawData || !Array.isArray(rawData)) {
            return res.json({ success: true, logs: [] });
        }

        const logs = rawData
            .filter(item => item.document)
            .map(item => {
                const fields = item.document.fields;
                return {
                    id: item.document.name.split('/').pop(),
                    name: fields.name?.stringValue || "Unknown",
                    message: fields.text?.stringValue || "",
                    color: fields.color?.stringValue || "#000000",
                    icon: fields.iconUrl?.stringValue || null,
                    image: fields.imageUrl?.stringValue || null,
                    timestamp: fields.createdAt?.timestampValue || ""
                };
            });

        res.json({ success: true, logs: logs });

    } catch (error) {
        console.error("오류:", error.message);
        res.status(500).json({ success: false, error: "데이터 추출 실패" });
    }
});

const PORT = 10000;
app.listen(PORT, () => console.log(`서버 가동 중: ${PORT}`));