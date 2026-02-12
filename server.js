const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Render 환경 변수에서 값을 가져옵니다.
const CONFIG = {
    apiKey: process.env.FIREBASE_API_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID || "ccfolia-160aa"
};

app.post('/extract-direct', async (req, res) => {
    const { url } = req.body;
    try {
        const roomId = url.split('/').pop();
        if (!roomId) throw new Error("ID 추출 실패");

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
                // 시간순(과거->최신)으로 정렬하여 반전 방지
                orderBy: [
                    { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
                    { field: { fieldPath: "__name__" }, direction: "ASCENDING" }
                ]
            }
        });

        const logs = (response.data || [])
            .filter(item => item.document)
            .map(item => {
                const f = item.document.fields;
                return {
                    name: f.name?.stringValue || "Unknown",
                    message: f.text?.stringValue || "",
                    color: f.color?.stringValue || "#000000",
                    icon: f.iconUrl?.stringValue || null,
                    image: f.imageUrl?.stringValue || null
                };
            });

        res.json({ success: true, logs });
    } catch (error) {
        if (error.response) {
            // Firebase가 보낸 상세 에러 메시지 확인
            console.error("Firebase 에러 상세:", JSON.stringify(error.response.data, null, 2));
            res.status(error.response.status).json({
                success: false,
                error: error.response.data.error.message || "권한이 없습니다."
            });
        } else {
            console.error("일반 오류:", error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.get('/', (req, res) => res.send("Server is Running"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));