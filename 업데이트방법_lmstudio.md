# LM Studio 업데이트 방법

> 작성일: 2026-02-23
> 검증 버전: 0.4.2 → 0.4.3
> 환경: Ubuntu 24.04, GNOME

---

## 개요

LM Studio를 단순히 `dpkg -i`로 덮어쓰기하면 버전 캐시 문제가 발생합니다.
UI에서 여전히 구버전으로 표시되거나, 앱 목록에 두 개가 나타나는 문제가 생깁니다.

**이 문서는 검증된 안전한 업데이트 절차입니다.**

---

## 업데이트 전 확인사항

### 1. 현재 버전 확인

```bash
dpkg -l | grep lm-studio
```

출력 예시:
```
ii  lm-studio  0.4.2+2  amd64  Discover, download, and run LLMs locally
```

### 2. 채팅 기록 확인

```bash
ls ~/.lmstudio/conversations/ | wc -l
```

출력 예시: `11` (현재 채팅 대화 수)

### 3. 새 버전 deb 파일 준비

다운로드 위치: `~/Downloads/LM-Studio-0.4.3-2-x64.deb` (약 600MB)

---

## 업데이트 절차

### Step 1: 백업 (선택사항, 권장)

채팅 기록과 설정을 백업합니다.

```bash
cp -r ~/.lmstudio ~/.lmstudio_backup_$(date +%Y%m%d_%H%M%S)
```

백업 확인:
```bash
ls -la ~/.lmstudio_backup_*
```

### Step 2: LM Studio 완전 종료

모든 LM Studio 프로세스를 강제 종료합니다.

```bash
pkill -9 -f 'lm-studio'
```

종료 확인:
```bash
pgrep -af 'lm-studio'
```
(출력 없으면 정상)

### Step 3: 기존 버전 완전 삭제

**중요**: `--purge` 옵션 필수! 단순 remove가 아닌 완전 삭제.

```bash
sudo dpkg --purge lm-studio
```

출력 예시:
```
(Reading database ... 326717 files and directories currently installed.)
Removing lm-studio (0.4.2+2) ...
Purging configuration files for lm-studio (0.4.2+2) ...
```

삭제 확인:
```bash
dpkg -l | grep lm-studio
```
(출력 없으면 정상)

### Step 4: Electron 캐시 삭제

**핵심 단계**: 이 캐시를 삭제하지 않으면 UI에서 구버전으로 표시됩니다.

```bash
rm -rf ~/.config/LM\ Studio/
```

**주의**:
- `~/.lmstudio/`는 삭제하지 마세요! (채팅 기록, 모델 설정 보존)
- `~/.config/LM Studio/`만 삭제합니다 (Electron 런타임 캐시)

### Step 5: 새 버전 설치

```bash
sudo dpkg -i ~/Downloads/LM-Studio-0.4.3-2-x64.deb
```

출력 예시:
```
Selecting previously unselected package lm-studio.
Preparing to unpack .../LM-Studio-0.4.3-2-x64.deb ...
Unpacking lm-studio (0.4.3+2) ...
Setting up lm-studio (0.4.3+2) ...
```

설치 확인:
```bash
dpkg -l | grep lm-studio
```

출력:
```
ii  lm-studio  0.4.3+2  amd64  Discover, download, and run LLMs locally
```

### Step 6: 데스크톱 파일 수정 (아이콘 실행용)

Ubuntu 24.04에서 앱 아이콘 클릭 실행을 위해 `--no-sandbox` 플래그가 필요합니다.

```bash
sudo sed -i 's|Exec="/opt/LM Studio/lm-studio"|Exec="/opt/LM Studio/lm-studio" --no-sandbox|' /usr/share/applications/lm-studio.desktop
```

수정 확인:
```bash
grep "Exec=" /usr/share/applications/lm-studio.desktop
```

출력:
```
Exec="/opt/LM Studio/lm-studio" --no-sandbox %U
```

### Step 7: 데스크톱 캐시 갱신

```bash
sudo update-desktop-database /usr/share/applications/
```

### Step 8: 로그아웃 후 다시 로그인

**필수**: GNOME이 데스크톱 파일 변경을 반영하려면 로그아웃/로그인이 필요합니다.

1. 현재 세션 로그아웃
2. 다시 로그인
3. 앱 목록에서 LM Studio 아이콘 클릭으로 실행 확인

---

## 업데이트 후 확인

### 1. 버전 확인 (dpkg)

```bash
dpkg -l | grep lm-studio
```

출력: `ii  lm-studio  0.4.3+2  amd64  ...`

### 2. 버전 확인 (UI)

LM Studio 실행 → Settings → General → App Update 섹션에서:
- `Installed: LM Studio 0.4.3 (Build 2)` 표시 확인

### 3. 채팅 기록 확인

```bash
ls ~/.lmstudio/conversations/ | wc -l
```

기존 채팅 수와 동일해야 함

### 4. 앱 목록 확인

앱 목록(Activities)에서 LM Studio가 **하나만** 표시되는지 확인

### 5. 아이콘 클릭 실행 확인

앱 목록에서 LM Studio 아이콘 클릭 → 정상 실행 확인

---

## 문제 해결

### 문제 1: UI에서 여전히 구버전으로 표시

**원인**: Electron 캐시가 남아있음

**해결**:
```bash
pkill -9 -f 'lm-studio'
rm -rf ~/.config/LM\ Studio/
/opt/LM\ Studio/lm-studio --no-sandbox
```

### 문제 2: 앱 아이콘 클릭해도 실행 안 됨

**원인**: `--no-sandbox` 플래그 누락 또는 GNOME 캐시 미반영

**해결**:
1. 데스크톱 파일 확인:
   ```bash
   grep "Exec=" /usr/share/applications/lm-studio.desktop
   ```
   `--no-sandbox`가 포함되어 있는지 확인

2. 없으면 추가:
   ```bash
   sudo sed -i 's|Exec="/opt/LM Studio/lm-studio"|Exec="/opt/LM Studio/lm-studio" --no-sandbox|' /usr/share/applications/lm-studio.desktop
   ```

3. 로그아웃 후 다시 로그인

### 문제 3: 앱 목록에 두 개가 표시됨

**원인**: 이전 설치 잔여물

**해결**:
```bash
# 데스크톱 파일 확인
ls /usr/share/applications/lm-studio*.desktop
ls ~/.local/share/applications/lm-studio*.desktop

# 중복 파일 삭제
sudo rm /usr/share/applications/lm-studio*.desktop  # 주의: 전부 삭제
rm ~/.local/share/applications/lm-studio*.desktop 2>/dev/null

# 다시 설치
sudo dpkg -i ~/Downloads/LM-Studio-0.4.3-2-x64.deb

# --no-sandbox 다시 추가
sudo sed -i 's|Exec="/opt/LM Studio/lm-studio"|Exec="/opt/LM Studio/lm-studio" --no-sandbox|' /usr/share/applications/lm-studio.desktop

# 캐시 갱신
sudo update-desktop-database /usr/share/applications/

# 로그아웃/로그인
```

### 문제 4: 채팅 기록이 사라짐

**원인**: `~/.lmstudio/` 폴더를 실수로 삭제

**해결**: 백업에서 복원
```bash
cp -r ~/.lmstudio_backup_YYYYMMDD_HHMMSS/conversations ~/.lmstudio/
```

---

## 핵심 요약

| 단계 | 명령어 | 왜 필요한가 |
|------|--------|-------------|
| 프로세스 종료 | `pkill -9 -f 'lm-studio'` | 파일 잠금 해제 |
| 완전 삭제 | `sudo dpkg --purge lm-studio` | 설정 파일까지 제거 |
| Electron 캐시 삭제 | `rm -rf ~/.config/LM\ Studio/` | 버전 캐시 초기화 |
| 새 버전 설치 | `sudo dpkg -i *.deb` | 깨끗한 설치 |
| --no-sandbox 추가 | `sudo sed -i ...` | Ubuntu 24.04 아이콘 실행 |
| 캐시 갱신 | `sudo update-desktop-database` | 데스크톱 메뉴 반영 |
| 로그아웃/로그인 | - | GNOME 캐시 반영 |

---

## 보존되는 데이터

| 경로 | 내용 | 삭제 여부 |
|------|------|-----------|
| `~/.lmstudio/conversations/` | 채팅 기록 | 보존 |
| `~/.lmstudio/models/` | 다운로드된 모델 | 보존 |
| `~/.lmstudio/.internal/` | 설정, 백엔드 | 보존 |
| `~/.config/LM Studio/` | Electron 캐시 | **삭제** |
| `/opt/LM Studio/` | 앱 실행 파일 | 교체 |

---

## 원스텝 업데이트 스크립트

모든 단계를 한 번에 실행하는 스크립트:

```bash
#!/bin/bash
# LM Studio 업데이트 스크립트
# 사용법: sudo bash update_lmstudio.sh /path/to/LM-Studio-x.x.x-x-x64.deb

set -e

DEB_FILE="$1"

if [ -z "$DEB_FILE" ] || [ ! -f "$DEB_FILE" ]; then
    echo "사용법: sudo bash $0 /path/to/LM-Studio-x.x.x-x-x64.deb"
    exit 1
fi

echo "=== LM Studio 업데이트 시작 ==="

echo "[1/6] 프로세스 종료..."
pkill -9 -f 'lm-studio' 2>/dev/null || true
sleep 1

echo "[2/6] 기존 버전 삭제..."
dpkg --purge lm-studio 2>/dev/null || true

echo "[3/6] Electron 캐시 삭제..."
rm -rf /home/$SUDO_USER/.config/LM\ Studio/

echo "[4/6] 새 버전 설치..."
dpkg -i "$DEB_FILE"

echo "[5/6] 데스크톱 파일 수정..."
sed -i 's|Exec="/opt/LM Studio/lm-studio"|Exec="/opt/LM Studio/lm-studio" --no-sandbox|' /usr/share/applications/lm-studio.desktop

echo "[6/6] 캐시 갱신..."
update-desktop-database /usr/share/applications/

echo ""
echo "=== 업데이트 완료 ==="
echo "버전: $(dpkg -l | grep lm-studio | awk '{print $3}')"
echo ""
echo "*** 로그아웃 후 다시 로그인하세요! ***"
```

저장 위치: `/home/yooha/JOB_FOLD/LLM_test/LMStudio_JOB/update_lmstudio.sh`

사용법:
```bash
sudo bash update_lmstudio.sh ~/Downloads/LM-Studio-0.4.3-2-x64.deb
```
