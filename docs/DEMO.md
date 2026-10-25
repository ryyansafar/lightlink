# LightLink demo script (3 minutes)

One real Android-to-Android transfer has worked (an 86 KB PDF on 25 Oct 2026); the iPhone is still untested, so run the pre-flight first anyway.

## Pre-flight checklist (do this 15 minutes before)

- [ ] Both phones: open the LightLink URL once on Wi-Fi. Home screen must show the green "Ready offline" badge. Add to home screen if you like.
- [ ] Both phones: screen brightness at maximum, auto-lock off, camera permission granted to the site (open Receive once and allow).
- [ ] Phone A (sender): a small PDF (under 100 KB) in Files/Downloads.
- [ ] Laptop: LightLink open, a 100 to 150 KB file ready, browser zoom 100 percent, brightness max.
- [ ] Phone B (receiver): a contact saved that you can send back as a card (or use "Make contact card" in the app).
- [ ] Run the Loopback self-test on each phone: must say PASS.
- [ ] Wipe the screens (no notifications, Do Not Disturb on). Clean the camera lenses.
- [ ] Pre-recorded capture of a successful transfer on your phone, saved as a video, in case the room is too bright.
- [ ] Only now: switch both phones to airplane mode and show the airplane icon.

## Script

**0:00 Setup line.** "Both phones are in airplane mode. No Wi-Fi, no Bluetooth, no cellular. Watch the status bars."

**0:20 Send a PDF, phone to phone.**
1. Phone A: Send, Choose a file, pick the PDF. Point out the file size, chunk count and the 4 emoji fingerprint.
2. Tap Start. A QR video fills the screen.
3. Phone B: Receive, point at phone A about 20 to 30 cm away, fill the camera view with the QR.
4. Narrate the block grid lighting up. When it goes green the phone vibrates.
5. Compare the 4 emoji on both screens. Tap Open to show the PDF.

**1:15 Cover the screen for 3 seconds.**
1. Start the same send again (Receive another).
2. Mid-transfer, put your hand over the sender screen for 3 seconds. Say: "Nothing to resend. Every packet is as good as any other."
3. Uncover. It finishes.

**1:50 Laptop sender, bigger file.**
1. Laptop: Send, choose the 100 to 150 KB file, Laptop mode (QR fills the window), keep the recommended QR M and 8 fps (do not raise fps for a real camera). Narrate the elapsed time while it runs.
2. Phone B receives it. The receiver shows elapsed seconds and "N packets of about M needed", so narrate the wait. It takes tens of seconds, not instant; state the rate you actually see on the day.

**2:30 vCard back.**
1. Phone B: Send, Make contact card, fill name and number, Start.
2. Phone A: Receive. Tap Save contact.

**2:50 Close.** "Two phones, zero connectivity, a file in the other one. Source and numbers are in the repo." Show the socials from the README.

## If something goes wrong

- Receiver stuck near 0 percent with the "Low decode rate" hint: move closer or further so the QR fills the view, brightness up, do what the hint says, it names the exact QR size and fps to ask the sender for, kill glare.
- Camera blocked message: allow the camera for the site in browser settings, tap Try again.
- Last resort: run the **Loopback self-test** on one phone. It pushes 100 KB through the real QR draw and decode path on one device and shows PASS plus measured throughput. Then play the pre-recorded capture.
