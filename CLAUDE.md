# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

LM Studio 모델을 HDD에서 RAMDisk(tmpfs)로 복사하여 추론 속도를 향상시키는 유틸리티. bind mount 방식을 사용하여 LM Studio가 원래 경로로 접근하면서 실제로는 RAM에서 읽도록 함.

## 사용법

```bash
# ON (기본) - 모델 선택 → RAMDisk 복사 → bind mount
sudo python3 hdd_to_ramdisk.py

# OFF - 전체 umount + RAM 복사본 삭제 + tmpfs umount
sudo python3 hdd_to_ramdisk.py off

# 상태 확인
python3 hdd_to_ramdisk.py status
```

## 주요 옵션

- `--scan-root`: 모델 검색 경로 (기본: `/mnt/data24tb/model/lmstudio/models`)
- `--ram-mount`: RAMDisk 마운트 지점 (기본: `/mnt/rammodels`)
- `--ram-size`: tmpfs 용량 GB (기본: 100)

## 의존성

- Python 3.10+
- `tqdm` 패키지: `pip install tqdm`
- sudo 권한 필요 (mount/umount)

## 아키텍처

- `.gguf` 파일이 있는 폴더를 모델 폴더로 인식
- tmpfs에 모델 복사 후 `mount --bind`로 원본 경로를 덮어씀
- 재부팅 시 mount가 풀려 자동으로 HDD 원복
