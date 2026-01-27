const config = require("./apikey.js");
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// [사용자 설정 영역]
const CONFIG = {
    apiKey: config.apiKey, // 찾아낸 API Key
    projectId: config.projectId// 찾아낸 Project ID
};

app.post('/extract-direct', async (req, res) => {
    const { url } = req.body; 
    
    try {
        // 1. URL에서 Room ID 파싱
        const roomId = url.split('/').pop();
        if (!roomId) throw new Error("URL에서 방 ID를 찾을 수 없습니다.");

        console.log(`[시작] 방 ID: ${roomId} 데이터 요청 중...`);

        // 2. Firestore 쿼리 실행 (시간순 정렬)
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents:runQuery?key=${CONFIG.apiKey}`;
        
        const response = await axios.post(firestoreUrl, {
            structuredQuery: {
                from: [{ collectionId: "messages" }], // 컬렉션 이름
                where: {
                    fieldFilter: {
                        field: { fieldPath: "roomId" }, // roomId가 일치하는 것만
                        op: "EQUAL",
                        value: { stringValue: roomId }
                    }
                },
                orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
                    { field: { fieldPath: "__name__" }, direction: "ASCENDING" }
                ]
            }
        });

        // 3. 데이터 가공 (이미지 포함)
        const rawData = response.data;
        
        // 데이터가 없는 경우 처리
        if (!rawData || !Array.isArray(rawData)) {
            return res.json({ success: true, logs: [], message: "데이터가 없거나 접근 권한이 없습니다." });
        }

        const logs = rawData
            .filter(item => item.document) // 문서가 존재하는지 확인
            .map(item => {
                const fields = item.document.fields;
                
                // [핵심] 이미지 필드 안전하게 추출
                const iconUrl = fields.iconUrl?.stringValue || null;  // 캐릭터 프로필
                const attachmentUrl = fields.imageUrl?.stringValue || null; // 업로드한 이미지
                
                return {
                    id: item.document.name.split('/').pop(), // 메시지 고유 ID
                    name: fields.name?.stringValue || "Unknown",
                    message: fields.text?.stringValue || "",
                    color: fields.color?.stringValue || "#000000",
                    
                    // 이미지 정보 추가
                    icon: iconUrl,           // 프로필 사진 주소
                    image: attachmentUrl,    // 첨부 이미지 주소
                    
                    timestamp: fields.createdAt?.timestampValue || ""
                };
            });

        console.log(`[성공] 총 ${logs.length}개의 로그(이미지 포함) 추출 완료`);
        res.json({ success: true, logs: logs });

    } catch (error) {
        console.error("오류 발생:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "데이터 추출 실패 (보안 설정 혹은 ID 오류)" });
    }
});

const PORT = 10000;
app.listen(PORT, () => console.log(`서버 가동 중 (이미지 추출 모드): Port ${PORT}`));