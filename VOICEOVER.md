# Awaremap — voiceover read-through

**Rule #1:** read the numbers that appear in YOUR footage, not today's live values.
The viewer sees the screen while you talk. If the clip says 85 kts, say 85 kts.

**Rule #2:** record each block separately. A fluff costs you one block, not the video.

---

## 1 · COLD OPEN (over the fire) — 22s
I started building this last year, after a typhoon hit the Philippines and Taiwan.
I wanted one screen that showed what was actually happening in a place — anywhere —
instead of ten tabs across four countries.

Then last week my school was evacuated. A fire started in the hills and burned into
San Juan Capistrano — into the town my school is in. Eight families I know lost
their homes.

And I opened the thing I'd been building, and it was already showing it. Five hundred
and seventy acres. ⟨% contained, as shown in your clip⟩. I built it for somewhere
else and ended up needing it here.

## 2 · WHO YOU ARE — 14s
I'm ⟨name⟩, a ninth grader at ⟨school⟩ in Orange County, and I built Awaremap —
one screen that shows what's happening around any place on Earth, using data the
government already publishes for free.

## 3 · THE PROBLEM — 14s
None of this was secret. CAL FIRE had the acreage. The Weather Service had the wind
warning. Air quality was public. Evacuation zones were public. It was in five
different places, and nobody checks five websites while they're packing a car.

## 4 · IRVINE → SAN JUAN — 18s
I live in Irvine. That's twenty-nine kilometres from the fire. My school is in San
Juan Capistrano — three and a half.

Every pin says where it came from. That one's from the federal wildfire system.
The one under it is NASA. Same fire, two agencies, two different positions for it.

## 5 · THE REGION — 14s
And it isn't just my town. That's every active fire in Southern California that
morning, with live precipitation radar on top.

## 6 · MANILA → THE TYPHOON — 23s
Same app, same code, other side of the planet. Those are Philippine earthquakes.
That's Manila's airport reporting its own weather.

And that — ⟨storm name and wind speed shown in your clip⟩ — is a super typhoon, out
there right now, between Taiwan and the northern Philippines. That is the same
stretch of ocean Ragasa came through last year. That storm is why I started building
this.

## 7 · THE CODE — 35s
It's plain JavaScript and Leaflet — no framework, no build step — plus a small Python
server. Twenty-seven public feeds.

The hard part was that browsers refused to load five of them. Cross-origin security
stops a page from reading another site's data, so those feeds failed silently. I
wrote a small server that fetches them for the app instead.

My first version forwarded any URL you handed it. Which means I'd built an open relay
— anyone could point my server at anything. So I locked it to exactly five hostnames.

I chose a hard-coded allowlist over a general proxy because a tool that helps five
people isn't worth running infrastructure that anyone could abuse.

## 8 · IMPACT — 18s
It doesn't put out fires and it doesn't evacuate anybody. What it does is take
information that's already public and already free, and put it on one screen fast
enough to be useful while something is actually happening.

It needs no account, stores nothing, and works in any browser, including a phone.

## 9 · CLOSE + DISCLOSURE — 7s
Next I'm adding saved places, so it can watch my school and my house and tell me when
something changes.

⟨YOUR AI DISCLOSURE — one honest sentence. What Claude did, what you did. Write this
yourself; it's the one line a judge could check.⟩

Thanks for watching.

---

## Before you record
- [ ] Quiet room, door shut, phone on silent, notifications off
- [ ] Read the whole thing out loud ONCE first — change anything that isn't how you talk
- [ ] Sit close to the mic; AirPods or a phone beat a laptop mic
- [ ] Leave one second of silence at the start and end of each block, for trimming
- [ ] Slightly slower than feels natural — everyone rushes on the first take
- [ ] Block 7 is the scored one. Don't speed through the last sentence.
