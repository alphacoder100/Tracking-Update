#!/usr/bin/env python3
"""
Test script to find available camera indices on Windows
"""

import cv2

def test_cameras(max_index=10):
    """Test camera indices 0 to max_index-1"""
    available = []

    for i in range(max_index):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)  # CAP_DSHOW is better on Windows
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                available.append(i)
                print(f"✓ Camera {i}: Available (resolution: {frame.shape[1]}x{frame.shape[0]})")
            else:
                print(f"✗ Camera {i}: Opened but can't read frames")
            cap.release()
        else:
            print(f"✗ Camera {i}: Not available")

    return available

if __name__ == "__main__":
    print("Testing camera indices 0-9...")
    print("-" * 50)
    available_cameras = test_cameras(10)
    print("-" * 50)

    if available_cameras:
        print(f"\nAvailable cameras: {available_cameras}")
        print(f"Use CAMERA_SOURCE={available_cameras[0]} in .env")
    else:
        print("\nNo cameras found! Check that your webcam is:")
        print("1. Connected to the PC")
        print("2. Not being used by another application")
        print("3. Allowed in Windows Privacy settings")
