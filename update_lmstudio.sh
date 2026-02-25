#!/bin/bash
# LM Studio 업데이트 스크립트
# 사용법: sudo bash update_lmstudio.sh /path/to/LM-Studio-x.x.x-x-x64.deb
# 작성일: 2026-02-23

set -e

DEB_FILE="$1"

if [ -z "$DEB_FILE" ] || [ ! -f "$DEB_FILE" ]; then
    echo "사용법: sudo bash $0 /path/to/LM-Studio-x.x.x-x-x64.deb"
    exit 1
fi

# SUDO_USER가 없으면 현재 사용자 사용
USER_HOME="/home/${SUDO_USER:-$USER}"

echo "=== LM Studio 업데이트 시작 ==="
echo "대상 deb: $DEB_FILE"
echo "사용자 홈: $USER_HOME"
echo ""

echo "[1/6] 프로세스 종료..."
pkill -9 -f 'lm-studio' 2>/dev/null || true
sleep 1

echo "[2/6] 기존 버전 삭제..."
dpkg --purge lm-studio 2>/dev/null || true

echo "[3/6] Electron 캐시 삭제..."
rm -rf "$USER_HOME/.config/LM Studio/"

echo "[4/6] 새 버전 설치..."
dpkg -i "$DEB_FILE"

echo "[5/6] 데스크톱 파일 수정 (--no-sandbox 추가)..."
sed -i 's|Exec="/opt/LM Studio/lm-studio"|Exec="/opt/LM Studio/lm-studio" --no-sandbox|' /usr/share/applications/lm-studio.desktop

echo "[6/6] 캐시 갱신..."
update-desktop-database /usr/share/applications/

echo ""
echo "=== 업데이트 완료 ==="
echo "설치된 버전: $(dpkg -l | grep lm-studio | awk '{print $3}')"
echo "채팅 기록: $(ls "$USER_HOME/.lmstudio/conversations/" 2>/dev/null | wc -l)개 보존됨"
echo ""
echo "*** 중요: 로그아웃 후 다시 로그인하세요! ***"
echo "*** (GNOME 캐시 반영을 위해 필수) ***"
