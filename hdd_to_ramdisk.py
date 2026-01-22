#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
hdd_to_ramdisk.py (bind-mount 기반, 재부팅 자동 원복 구조)

기본(인자 없음): ON
  - HDD 모델 폴더를 검색해 선택 (복수 선택 가능)
  - tmpfs(RAMDisk) 마운트 (없으면 자동)
  - 선택한 모델을 RAMDisk로 복사 (진행률 바)
  - mount --bind 로 원래 경로를 RAM 복사본으로 덮어쓰기
  - off를 까먹어도 재부팅하면 mount가 풀려 HDD로 자동 원복

OFF 모드:
  - scan_root 아래에서 현재 MOUNTED(덮어진) 모델 폴더를 전부 umount
  - RAMDisk 안의 복사본 폴더를 전부 삭제
  - tmpfs까지 umount 시도(가능하면)
  - 결과적으로 "없었던 일처럼" 깔끔히 정리

STATUS 모드:
  - 현재 tmpfs/마운트 상태 출력
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from tqdm import tqdm
except ImportError:
    print("필수 패키지 tqdm가 없습니다. 설치: pip install tqdm")
    sys.exit(1)

DEFAULT_SCAN_ROOT = Path("/mnt/data24tb/model/lmstudio/models")
DEFAULT_RAM_MOUNT = Path("/mnt/rammodels")
DEFAULT_RAM_SIZE_GB = 100
CHUNK_SIZE = 8 * 1024 * 1024  # 8MB


# -----------------------------
# 유틸
# -----------------------------
def run(cmd: list[str], check=True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def human_bytes(n: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    v = float(n)
    for u in units:
        if v < 1024:
            return f"{v:.1f} {u}"
        v /= 1024
    return f"{v:.1f} PB"


def is_mounted(path: Path) -> bool:
    try:
        run(["mountpoint", "-q", str(path)], check=True)
        return True
    except subprocess.CalledProcessError:
        return False


def get_mount_fstype(path: Path) -> str | None:
    """
    /proc/mounts에서 path의 fstype을 찾는다 (예: tmpfs)
    """
    try:
        with open("/proc/mounts", "r", encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 3:
                    mnt = parts[1]
                    fstype = parts[2]
                    if mnt == str(path):
                        return fstype
    except Exception:
        return None
    return None


def ensure_tmpfs(mount_point: Path, size_gb: int) -> None:
    mount_point.mkdir(parents=True, exist_ok=True)

    if is_mounted(mount_point):
        # 이미 마운트되어 있으면 그대로 사용
        return

    try:
        print(f"[+] tmpfs 마운트: {mount_point} (size={size_gb}G)")
        run(["sudo", "mount", "-t", "tmpfs", "-o", f"size={size_gb}G", "tmpfs", str(mount_point)])
    except subprocess.CalledProcessError as e:
        print("[-] tmpfs 마운트 실패. sudo 권한이 필요할 수 있습니다.")
        print(e.stderr.strip())
        print("예: sudo python3 hdd_to_ramdisk.py")
        sys.exit(1)


def folder_size_bytes(folder: Path) -> int:
    total = 0
    for p in folder.rglob("*"):
        try:
            if p.is_file() and not p.is_symlink():
                total += p.stat().st_size
        except FileNotFoundError:
            pass
    return total


def find_model_folders(scan_root: Path) -> list[Path]:
    """
    폴더 내부에 *.gguf 파일이 있으면 "모델 폴더" 후보로 간주
    """
    candidates = []
    if not scan_root.exists():
        return candidates

    for d in scan_root.rglob("*"):
        if not d.is_dir():
            continue
        try:
            ggufs = list(d.glob("*.gguf"))
        except PermissionError:
            continue
        if ggufs:
            candidates.append(d)

    return sorted(set(candidates), key=lambda p: str(p))


def parse_selection(sel: str, max_index: int) -> list[int]:
    """
    "1,3,5-7" 같은 입력을 [1,3,5,6,7]로 파싱 (1-based)
    """
    sel = sel.strip()
    if not sel:
        return []
    parts = [p.strip() for p in sel.split(",")]
    out = set()

    for p in parts:
        if re.fullmatch(r"\d+", p):
            out.add(int(p))
        elif re.fullmatch(r"\d+-\d+", p):
            a, b = p.split("-")
            a = int(a)
            b = int(b)
            if a > b:
                a, b = b, a
            for x in range(a, b + 1):
                out.add(x)
        else:
            raise ValueError("선택 형식이 잘못되었습니다. 예: 1,3,5-7")

    out = sorted(out)
    for x in out:
        if x < 1 or x > max_index:
            raise ValueError(f"선택 번호가 범위를 벗어났습니다: {x}")
    return out


def ramdisk_free_bytes(mount_point: Path) -> int:
    usage = shutil.disk_usage(mount_point)
    return usage.free


# -----------------------------
# 복사/마운트
# -----------------------------
def copy_tree_with_progress(src_dir: Path, dst_dir: Path) -> None:
    """
    src_dir -> dst_dir 복사 (파일 바이트 기준 진행률 표시)
    """
    files = []
    total_bytes = 0

    for f in src_dir.rglob("*"):
        if f.is_file() and not f.is_symlink():
            rel = f.relative_to(src_dir)
            files.append((f, rel))
            total_bytes += f.stat().st_size

    if total_bytes == 0:
        raise RuntimeError("복사할 파일이 없습니다.")

    dst_dir.mkdir(parents=True, exist_ok=True)

    print(f"[+] 복사 시작: {src_dir.name}")
    print(f"    TOTAL: {human_bytes(total_bytes)} / FILES: {len(files)}")

    with tqdm(total=total_bytes, unit="B", unit_scale=True, desc="Copying", ncols=110) as bar:
        for src_file, rel in files:
            out_file = dst_dir / rel
            out_file.parent.mkdir(parents=True, exist_ok=True)

            with src_file.open("rb") as rf, out_file.open("wb") as wf:
                while True:
                    chunk = rf.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    wf.write(chunk)
                    bar.update(len(chunk))

            # 권한/시간 정보 보존 (가능하면)
            try:
                shutil.copystat(src_file, out_file, follow_symlinks=False)
            except Exception:
                pass

    print("[+] 복사 완료")


def bind_mount(src_dir: Path, target_dir: Path) -> None:
    """
    target_dir(원래 HDD 모델 폴더)에 src_dir(RAM 복사본)을 bind mount
    """
    if not src_dir.exists():
        raise RuntimeError(f"RAM 폴더가 없습니다: {src_dir}")

    target_dir.mkdir(parents=True, exist_ok=True)

    if is_mounted(target_dir):
        print(f"[i] 이미 MOUNTED 상태라 스킵: {target_dir}")
        return

    try:
        print(f"[+] bind mount: {src_dir.name}")
        run(["sudo", "mount", "--bind", str(src_dir), str(target_dir)])
    except subprocess.CalledProcessError as e:
        print("[-] bind mount 실패 (모델 사용 중(busy)일 수 있음)")
        print(e.stderr.strip())
        print("LM Studio에서 해당 모델을 Eject 한 뒤 다시 시도하세요.")
        sys.exit(1)


def unmount(target_dir: Path) -> None:
    if not is_mounted(target_dir):
        return
    try:
        run(["sudo", "umount", str(target_dir)])
    except subprocess.CalledProcessError as e:
        print(f"[-] umount 실패: {target_dir}")
        print(e.stderr.strip())
        print("LM Studio에서 해당 모델을 Eject 한 뒤 다시 시도하세요.")
        sys.exit(1)


# -----------------------------
# 모드 구현
# -----------------------------
def mode_status(scan_root: Path, ram_mount: Path) -> None:
    print("===========================================")
    print(" STATUS")
    print("===========================================")
    print(f"scan_root : {scan_root}")
    print(f"ram_mount : {ram_mount} (mounted={is_mounted(ram_mount)})")
    if is_mounted(ram_mount):
        fstype = get_mount_fstype(ram_mount)
        freeb = ramdisk_free_bytes(ram_mount)
        print(f"fstype    : {fstype}")
        print(f"free      : {human_bytes(freeb)}")
        try:
            print(run(["df", "-h", str(ram_mount)], check=True).stdout.strip())
        except Exception:
            pass

    models = find_model_folders(scan_root)
    mounted_models = [m for m in models if is_mounted(m)]

    print("\n[현재 RAM으로 덮어진(MOUNTED) 모델 폴더]")
    if not mounted_models:
        print("  - 없음")
    else:
        for m in mounted_models:
            print(f"  - {m}")

    print("")


def mode_off(scan_root: Path, ram_mount: Path) -> None:
    """
    ✅ 요청대로: off는 '전부 자동삭제' (선택 없음)
    """
    print("===========================================")
    print(" OFF: 전체 원복 + 자동삭제")
    print("===========================================")

    # 1) MOUNTED 된 모델 전부 umount
    models = find_model_folders(scan_root)
    mounted_models = [m for m in models if is_mounted(m)]

    if mounted_models:
        print(f"[+] umount 대상: {len(mounted_models)}개")
        for m in mounted_models:
            print(f"    - {m}")
        for m in mounted_models:
            print(f"[+] umount: {m.name}")
            unmount(m)
    else:
        print("[i] umount할 모델이 없습니다.")

    # 2) RAMDisk 복사본 전부 삭제
    if ram_mount.exists():
        # ram_mount 안의 "모델 폴더들"을 전부 삭제 (안전하게 디렉토리만)
        if is_mounted(ram_mount):
            print(f"[+] RAMDisk 복사본 삭제: {ram_mount}/*")
            for child in ram_mount.iterdir():
                if child.is_dir() and not child.is_symlink():
                    try:
                        shutil.rmtree(child)
                        print(f"    deleted: {child.name}")
                    except Exception as e:
                        print(f"    [!] 삭제 실패: {child} ({e})")
        else:
            print("[i] RAMDisk가 마운트되어 있지 않습니다. (삭제 스킵)")

    # 3) tmpfs 언마운트 시도 (가능하면)
    if is_mounted(ram_mount):
        fstype = get_mount_fstype(ram_mount)
        if fstype == "tmpfs":
            print(f"[+] tmpfs umount 시도: {ram_mount}")
            try:
                run(["sudo", "umount", str(ram_mount)], check=True)
                print("[+] tmpfs umount 완료")
            except subprocess.CalledProcessError as e:
                # 누군가 ram_mount를 사용 중이면 실패할 수 있음
                print("[!] tmpfs umount 실패(사용 중일 수 있음).")
                print(e.stderr.strip())
        else:
            print(f"[i] {ram_mount}는 tmpfs가 아니라서 umount하지 않습니다. (fstype={fstype})")

    print("\n✅ 완료! 이제 완전히 HDD 상태로 돌아갔습니다.")
    print("")


def mode_on(scan_root: Path, ram_mount: Path, ram_size_gb: int) -> None:
    """
    기본 디폴트: on
    - 모델 검색 → 복수 선택 → 용량 체크 → 복사 → bind mount
    """
    print("===========================================")
    print(" ON: HDD -> RAMDisk 복사 + bind mount")
    print("===========================================")
    print(f"scan_root: {scan_root}")
    print(f"ram_mount: {ram_mount}")
    print(f"ram_size : {ram_size_gb}G\n")

    ensure_tmpfs(ram_mount, ram_size_gb)

    candidates = find_model_folders(scan_root)
    if not candidates:
        print("[-] 모델 폴더를 찾지 못했습니다.")
        return

    print(f"[1] 후보 {len(candidates)}개 발견. 크기 계산 중...")
    models = []
    for p in candidates:
        size = folder_size_bytes(p)
        ggufs = len(list(p.glob("*.gguf")))
        mounted_flag = is_mounted(p)
        models.append((p, size, ggufs, mounted_flag))

    models.sort(key=lambda x: x[1], reverse=True)

    print("\n===== 모델 목록 =====")
    for i, (p, size, ggufs, mounted_flag) in enumerate(models, start=1):
        flag = " [MOUNTED]" if mounted_flag else ""
        print(f"{i:2d}) {p}{flag}")
        print(f"    - size: {human_bytes(size)} | gguf: {ggufs}")
    print("====================\n")

    print("선택 예시: 1  /  1,3,5  /  2-4  /  1,3,5-7\n")
    sel = input("RAM으로 올릴 번호 선택 (취소: q): ").strip().lower()
    if sel in ("q", "quit", "exit"):
        print("취소했습니다.")
        return

    try:
        idxs = parse_selection(sel, len(models))
    except ValueError as e:
        print(f"[-] {e}")
        return

    selected = [models[i - 1] for i in idxs]
    total_size = sum(s for _, s, _, _ in selected)

    freeb = ramdisk_free_bytes(ram_mount)
    # 여유 버퍼(5GB) 남기고 계산
    buffer = 5 * 1024**3

    print(f"\n[+] 선택된 모델 총합: {human_bytes(total_size)}")
    print(f"[+] RAMDisk 남은 공간: {human_bytes(freeb)}")

    if total_size + buffer > freeb:
        print("\n[-] RAMDisk 공간이 부족합니다.")
        print("    해결 방법:")
        print(f"    - RAMDisk size를 키우기 (--ram-size {ram_size_gb + 20} 같은 식)")
        print("    - 선택 모델 개수를 줄이기")
        return

    # 처리
    for src_dir, src_size, _, mounted_flag in selected:
        ram_copy = ram_mount / src_dir.name

        print("\n-------------------------------------------")
        print(f"모델: {src_dir.name}")
        print(f"원본: {src_dir}")
        print(f"크기: {human_bytes(src_size)}")
        print(f"RAM : {ram_copy}")
        print("-------------------------------------------")

        # 이미 mount 상태면 "복사/마운트 스킵"을 기본으로
        if mounted_flag:
            print("[i] 이미 MOUNTED 상태입니다. 스킵합니다.")
            continue

        # RAM 복사본 존재하면 재복사 여부
        if ram_copy.exists():
            ans = input("[?] RAM에 복사본이 이미 있습니다. 재복사할까요? (y/N): ").strip().lower()
            if ans == "y":
                shutil.rmtree(ram_copy)
            else:
                print("[i] 기존 RAM 복사본 사용")
        else:
            ram_copy.mkdir(parents=True, exist_ok=True)

        # 복사
        if not list(ram_copy.glob("*.gguf")):
            copy_tree_with_progress(src_dir, ram_copy)
        else:
            # gguf 존재하면 복사를 생략할지 물어봄
            ans = input("[?] RAM 복사본에 gguf가 있습니다. 복사를 생략하고 mount만 할까요? (y/N): ").strip().lower()
            if ans != "y":
                shutil.rmtree(ram_copy)
                ram_copy.mkdir(parents=True, exist_ok=True)
                copy_tree_with_progress(src_dir, ram_copy)

        # bind mount
        bind_mount(ram_copy, src_dir)

    print("\n✅ 완료!")
    print("- 이제 LM Studio는 원래 경로로 접근하지만 실제로는 RAMDisk에서 읽습니다.")
    print("- 원복/정리: python3 hdd_to_ramdisk.py off")
    print("- off를 까먹어도 재부팅하면 mount가 풀려 HDD로 자동 원복됩니다.")
    print("")


# -----------------------------
# entry
# -----------------------------
def main():
    ap = argparse.ArgumentParser(add_help=True)

    # ✅ 인자 없으면 ON이 기본
    ap.add_argument("mode", nargs="?", default="on", choices=["on", "off", "status"],
                    help="(기본: on) on: RAM으로 덮기 / off: 전체 원복+자동삭제 / status: 상태 보기")

    ap.add_argument("--scan-root", default=str(DEFAULT_SCAN_ROOT), help="모델 검색 루트 경로")
    ap.add_argument("--ram-mount", default=str(DEFAULT_RAM_MOUNT), help="tmpfs(RAMDisk) 마운트 지점")
    ap.add_argument("--ram-size", type=int, default=DEFAULT_RAM_SIZE_GB, help="tmpfs 용량(GB)")

    args = ap.parse_args()

    scan_root = Path(args.scan_root)
    ram_mount = Path(args.ram_mount)

    if args.mode == "status":
        mode_status(scan_root, ram_mount)
    elif args.mode == "off":
        mode_off(scan_root, ram_mount)
    else:
        mode_on(scan_root, ram_mount, args.ram_size)


if __name__ == "__main__":
    main()
