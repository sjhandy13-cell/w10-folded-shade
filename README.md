# 접힌 그늘: 발표 웹

배포 주소: https://w10-folded-shade.vercel.app

웹 페이지 하나로 하는 10주차 발표용 페이지입니다. three.js r170 이 `lib/` 에 들어 있어 인터넷 CDN 없이도 돌아갑니다.

## 폴더

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 글자 (장면 5개의 문장은 여기서 고칩니다) |
| `main.js` | 장면, 조작, 3D |
| `fold.js` | 접기 공식 (GH 의 FOLD 와 같은 식) |
| `pavilion.json` | GH 의 BLOCKS 가 저장한 파일. **새로 저장하면 이 파일만 바꿔 넣으면 됩니다** |
| `assets/gh_canvas.png` | GH 캔버스 캡처를 이 이름으로 넣으면 3장면에 나옵니다 |
| `pavilion.glb` | 라이노 Export Selected → glTF Binary (미터, Z→Y). 3장면에서 선으로 겹쳐 보기. 원본 21 MB 를 재질별로 합쳐 10.9 MB 로 줄인 것 |

## 내 컴퓨터에서 보기

```
cd 이_폴더
npx serve
```

뜬 `http://localhost:3000` 으로 들어갑니다. index.html 을 더블클릭하면 pavilion.json 을 못 읽습니다.
느린 노트북이면 주소 끝에 `?lite` 를 붙이면 그림자를 가볍게 그립니다.

## 배포 (GitHub + Vercel)

1. GitHub 에 새 저장소를 만들고 이 폴더 안의 파일을 그대로 올립니다.
2. vercel.com → Add New → Project → 그 저장소 Import → Framework Preset 은 **Other**, Build 설정은 비워 두고 Deploy.
3. 나온 `https://○○.vercel.app` 주소를 제출합니다. 이후 pavilion.json 을 바꿔 GitHub 에 올리면 자동으로 다시 배포됩니다.

## 발표 키

→ / ← 다음·이전, 1~5 장면, R 고정 시점, O 원근/평행, N 대본, Q 예상 질문, P 다시 재생, F 전체 화면. 사람 더블클릭 → 시선 보기 (W A S D, 방향키로 걷기, Esc 로 나가기)

## 화면 설정 바꾸기

`main.js` 맨 위 `TEXT` (이름, 한 문장) 와 `CONFIG` (모델 표현, 배경, 그림자, 톤, 밤 보기, 글꼴, 강조색, 시작 연출, glb 보기) 값을 바꾸면 됩니다.
