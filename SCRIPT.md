# Awaremap — demo video script
**Target 2:45 · hard cap 3:00 · public on Vimeo**

Going over 3:00 scores 1/5 on Structure — an entire rubric row lost. Everything
below is word-counted at ~2.6 words/second, which is a relaxed speaking pace.
Record the screen and the voiceover **separately**; nobody nails both at once.

> 🔴 **Read the live numbers off your own screen when you record.** Containment
> was 80% on Oct 19, 90% on Oct 20, 98% on Oct 22. Never say a number the viewer
> can't see in the same frame.

> ⚠️ **Film the fire footage first, today.** The Norte Fire was 80% contained on
> Oct 19 and 90% on Oct 20. When it reaches 100% it will likely drop out of the
> live incident layer, and the centerpiece shot goes with it. Capture it now even
> if nothing else is ready.

---

## 0:00–0:22 · COLD OPEN — the real chronology *(58 words)*
**Screen:** Awaremap already open on San Juan Capistrano, NORTE card visible with
its live numbers. No narration of the interface. Let it sit.

> I started building this last year, after a typhoon hit the Philippines and
> Taiwan. I wanted one screen that showed what was actually happening in a place —
> anywhere — instead of ten tabs across four countries.
>
> Then last week my school was evacuated. A fire started in the hills and burned
> into San Juan Capistrano — into the town my school is in. Eight families I know
> lost their homes.
>
> And I opened the thing I'd been building, and it was already showing it. Five
> hundred and seventy acres. ⟨read the containment % off your own screen on the
> day you record⟩. I built it for somewhere else and ended up needing it here.

> 📌 **Do not imply the fire caused the project.** The app predates it by weeks and
> your file dates prove that. The true order — built for a distant disaster, then
> needed at home — is stronger *and* survives any follow-up question.

## 0:18–0:34 · WHO YOU ARE + THE ONE SENTENCE *(40 words)*
**Screen:** you, on camera. The only on-camera beat.

> I'm ⟨name⟩, a ⟨grade⟩ at ⟨school⟩ in Orange County, and I built Awaremap —
> one screen that shows what's happening around any place on Earth, using data
> the government already publishes for free.

## 0:34–0:50 · THE PROBLEM, NAMED *(42 words)*
**Screen:** slow scroll of the sidebar. Don't click anything.

> None of this was secret. CAL FIRE had the acreage. The Weather Service had the
> wind warning. Air quality was public. Evacuation zones were public. It was in
> five different places, and nobody checks five websites while they're packing
> a car.

## 0:50–1:40 · DEMO — three things, no more

**1 · Home — 0:50–1:08** *(34 words)*
Point at the fire card. Say the live numbers out loud.
> This is my town this morning. That's the Norte Fire — five hundred and seventy
> acres. The tide gauge is a kilometre from my house. That's the air quality.
> It isn't only fires.

**2 · The disagreement — 1:08–1:22** *(36 words)* ← **strongest technical beat**
> Here's something I only noticed because I built this. ⟨state the two numbers
> on your screen⟩ — same fire, same morning, two different agencies. So I show
> you which source every number came from.

**3 · Anywhere — 1:22–1:45** *(52 words)*
Search **Manila**. Let it load on camera. **Do not cut.** Scroll the sidebar down
a little to bring the typhoon into frame.

> Same app, same code, other side of the planet. Those are Philippine
> earthquakes. That's Manila's airport reporting its own weather.
>
> And that — ⟨read the name and wind speed off your screen⟩ — is a super typhoon,
> out there right now, between Taiwan and the northern Philippines. That is the
> exact stretch of ocean Ragasa came through last year. That storm is why I
> started building this. It's still happening, and so is this.

> 📌 Verified 22 Oct: NASA EONET lists **Super Typhoon Champi, 95 kts, 21.9°N
> 124.3°E**. Read whatever your screen says on the day — the name and the wind
> speed will have changed, and saying the live number is the whole point.

## 1:40–2:20 · THE CODE — a scored row, do not skip *(96 words)*
**Screen:** ~10s architecture diagram, then the real proxy code on screen.

> It's plain JavaScript and Leaflet — no framework, no build step — plus a small
> Python server. Twenty-seven public feeds.
>
> The hard part was that browsers refused to load five of them. Cross-origin
> security stops a page from reading another site's data, so those feeds failed
> silently. I wrote a small server that fetches them for the app instead.
>
> My first version forwarded any URL you handed it. Which means I'd built an
> open relay — anyone could point my server at anything. So I locked it to
> exactly five hostnames.

**The tradeoff sentence. This is what reads as real understanding:**
> I chose a hard-coded allowlist over a general proxy because a tool that helps
> five people isn't worth running infrastructure that anyone could abuse.

## 2:20–2:38 · IMPACT, stated honestly *(44 words)*
> It doesn't put out fires and it doesn't evacuate anybody. What it does is take
> information that's already public and already free, and put it on one screen
> fast enough to be useful while something is actually happening.

## 2:38–2:45 · CLOSE + DISCLOSURE *(38 words)*
> Next I'm adding saved places, so it can watch my school and my house and tell
> me when something changes. I used Claude, an AI assistant, while building this
> — ⟨one honest sentence: what it did, what you did⟩. Thanks for watching.

**Total: ~420 words ≈ 2:42 at a relaxed pace.**

---

## Before you hit record
- [ ] Quiet room, door shut, phone on silent — audio is scored, cinematography isn't
- [ ] Browser at **full screen**, bookmarks bar hidden, no other tabs visible
- [ ] Notifications off (macOS: Focus → Do Not Disturb)
- [ ] App already loaded before recording starts — no waiting on camera
- [ ] Decide your zoom level so the fire and your town are both in frame
- [ ] Record the screen first, then the voiceover over it
- [ ] Watch it once with the sound off — if it's confusing silently, it's confusing

## Cut list, in order, if you run long
1. Dead cursor movement and breaths *(free — always do this first)*
2. The tide/air-quality half of beat 1
3. The problem beat at 0:34, down to one sentence
4. The roadmap line at 2:38

**Never cut:** the fire opening, the live numbers, the two-agencies beat,
the tradeoff sentence, the honest impact statement, the AI disclosure.
