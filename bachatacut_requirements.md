# BachataCut — Functional MVP Design

## 1. Product vision

BachataCut turns ordinary recordings of bachata dances into beautiful videos people want to keep and share.

It is not trying to replace CapCut. CapCut is a broad video editor. BachataCut is a dance-aware assistant that understands that the important subject is a couple, that both dancers matter, and that a great Reel needs the right musical moment.

**Promise to the user:** Upload the whole dance. Get the moments worth posting.

## 2. Target users

### Social dancers

They record dances at socials and festivals. They want one attractive video, but often lack the time or editing skill to find and prepare it.

### Instructors and performers

They need polished clips for promotion, class recaps and student material. They regularly record demonstrations from more than one angle.

### Festival organizers and videographers

They have a large library of authorized recordings and want to give dancers a simple way to discover, buy and share their own memories.

## 3. The MVP in one sentence

A user uploads one full bachata recording; BachataCut returns three polished, vertical, ready-to-share Reels centered on the couple.

## 4. Core user journey

1. A user taps **Create a Reel** and uploads a dance recording.
2. BachataCut prepares the video and tells the user when it is ready.
3. The user receives three suggestions:
   - **Most impressive**
   - **Best musicality**
   - **Best connection**
4. The user watches the suggestions, selects one and makes optional small adjustments.
5. The user exports a video sized for Instagram Reels, TikTok or Stories.

The desired feeling is: “It found the exact part I wanted, and it already looks good.”

## 5. Foundation MVP features

### Upload and project library

Users can upload recordings from their device and return later to view them. Every dance has its own project, containing:

- The original recording
- Suggested Reels
- Any saved edits
- Finished exports

The original recording always stays intact. Users can delete a project whenever they choose.

### Automatic polish

BachataCut improves the presentation of a selected clip without changing the dance itself. It can make a recording feel steadier, clearer, brighter and better framed for a phone screen.

If the footage is too dark, shaky or crowded to improve confidently, BachataCut should be honest about it and offer the safest usable result rather than over-processing it.

### Simple Reel editor

The editor is designed for people who do not want a professional editing timeline. From a suggested Reel, users can:

- Make the start or end slightly earlier or later
- Choose a different framing style
- Add a short title or caption
- Add or remove a slow-motion moment
- Choose vertical, square or landscape format
- Preview, save and export

The app should lead with a finished suggestion. Editing is optional refinement, not work the user has to do to get a result.

## 6. Automatic best-moment Reel

### User value

The user does not need to scrub through a three-minute video looking for the only 20 seconds worth sharing.

### What BachataCut presents

The results page opens with three different clips rather than one generic auto-edit:

| Suggestion | Meaning |
|---|---|
| Most impressive | A visually strong movement, turn, dip or sequence, clearly captured |
| Best musicality | A moment where the movement and music work especially well together |
| Best connection | A warm, natural-looking moment of partner connection |

Each suggestion includes a brief human-readable reason, such as: “Both dancers stay clearly visible through this turn sequence.”

### What it should prefer

- Both dancers are visible
- The couple is framed attractively
- The moment begins and ends naturally
- The movement is easy to understand on a short video
- The recording is reasonably steady and clear
- The couple is not significantly blocked by other people

### What it should avoid

- Awkward moments before dancing begins or after it finishes
- Recovery steps and accidental pauses
- Moments where a partner leaves the frame
- Heavy obstruction by another couple or audience member
- Several nearly identical suggestions

### User feedback

Users can choose **More like this**, **Not my best moment**, or **Show other moments**. The app learns which type of suggestion is useful without asking the user to explain dance technique.

## 7. Couple-aware auto-camera

### User value

Generic video tools often center one person and accidentally crop out the other dancer. They also cut off feet during footwork or heads during turns. BachataCut treats the couple as one subject.

### Expected behavior

BachataCut should:

- Keep both dancers in view whenever possible
- Preserve heads and feet when the dance movement requires them
- Widen the view for turns, dips, travelling movements and footwork
- Move closer only when it supports a stable connection moment
- Keep framing movement smooth, calm and intentional
- Choose a wider, safer view if it cannot confidently frame the couple

### User framing choices

| Choice | Best for |
|---|---|
| Full couple | Default setting; preserves the whole dance and both partners |
| Connection | A closer view for quiet, intimate moments |
| Footwork | Keeps both dancers’ feet in the shot where possible |
| Original recording | Keeps the camera view exactly as recorded |

### Aha moment

A dancer compares a generic vertical crop that loses a partner during a turn with a BachataCut Reel that smoothly gives the couple more room just before the turn happens.

## 8. Automatic multicamera edit

### User value

When a dance has been filmed by several phones, BachataCut turns those separate recordings into one polished video. The user does not have to manually line up clips or decide every camera switch.

### User journey

1. The user chooses **Create from multiple angles**.
2. They add two to five videos of the same dance.
3. BachataCut returns a complete draft.
4. The user watches it and can tap any section to select a different camera angle.
5. The user exports the final cut.

### Expected editing choices

BachataCut should favor:

- The view that best shows both dancers
- Wide angles for turns and footwork
- Closer angles for connection, when they are clear and flattering
- Angles without people blocking the dancers
- Smooth camera changes at natural moments in the music

It should not switch angles in the middle of a dip, turn or other important connected movement unless the current view has become unusable.

### When it cannot make a good multicamera edit

If the uploaded videos do not clearly belong together, the app should say so simply: “These videos could not be combined into one dance.” It should then offer separate Reel suggestions for each recording.

### Aha moment

The user shares three shaky phone videos and receives a single edit that feels as if it was filmed intentionally from several cameras.

## 9. Find all my festival videos

### User value

At a festival, a dancer may appear in many official recordings but never see them. BachataCut helps an attendee find their own appearances in a participating festival’s authorized video library.

### Festival participant journey

1. The dancer opens the festival’s page in BachataCut.
2. The app clearly explains what is being searched, how long results will be available and how the dancer can remove them.
3. The dancer actively chooses to enroll and provides a current reference photo/video or uses the festival’s QR-linked recording process.
4. BachataCut presents possible appearances for the dancer to review.
5. The dancer confirms which results are actually them.
6. Confirmed clips appear in their private festival collection.
7. The dancer can download individual clips or purchase a personal highlight Reel.

### Privacy expectations

- Enrollment is always voluntary.
- A search applies only to the selected festival and its stated video collection.
- A dancer sees only their own possible appearances.
- No attendee directory or public people search exists.
- A dancer can remove their enrollment, results and reference at any time.
- BachataCut does not identify people who have not chosen to participate.

### Festival organizer experience

The organizer creates a private event page, states how long recordings will remain available and provides a simple enrollment link or QR code. The organizer can offer a paid video package, while dancers stay in control of whether they participate.

## 10. Key screens

| Screen | What the user can do |
|---|---|
| Home | Create a Reel, create from multiple angles, open past projects |
| Upload | Add a dance video or select several camera angles |
| Preparing your Reel | See clear progress while results are being prepared |
| Your best moments | Watch and choose the three named Reel suggestions |
| Reel editor | Make small adjustments, preview and export |
| Multicamera review | Watch the automatic edit and change an angle if wanted |
| Festival page | Enroll, review possible appearances and obtain festival videos |
| Library | Revisit originals, drafts and finished exports |

## 11. What is deliberately not included

The MVP does not try to be everything at once. It excludes:

- A full professional editing timeline
- A giant effects, filter or template library
- Dance scoring, correction or coaching
- Inventing missing movement or changing what happened in a dance
- Removing people from behind dancers in a way that alters the real performance
- Searching people across event footage without their participation
- Music licensing or a built-in social network

## 12. Rollout

### First release: “Upload the whole dance”

Single-video upload, automatic polish, couple-aware framing, three suggested Reels, simple adjustments and export.

### Second release: “It knows my best moment”

More accurate suggestions, clearer explanations and user feedback controls.

### Third release: “Make this look professionally filmed”

Multicamera editing for instructors, creators and selected dancers.

### Fourth release: “Find my festival memories”

A small pilot with participating festivals, explicit attendee enrollment and private personal collections.

## 13. Success criteria

The MVP is working when:

- A first-time user can export a Reel without learning video editing.
- Most users choose one of the app’s suggested moments instead of manually searching for one.
- Users feel both dancers are treated fairly in the frame.
- Multicamera users accept the automatic draft with only small changes.
- Festival participants feel that discovery is useful, accurate and fully under their control.
- Users describe BachataCut as “the easiest way to get a good video from a whole dance.”

## 14. Product principles

1. **Understand the couple, not just the image.**
2. **Show a good result before asking the user to edit.**
3. **Keep the dance authentic.**
4. **Choose a safe, wider frame when uncertain.**
5. **Keep original recordings untouched.**
6. **Make festival discovery private and opt-in.**
7. **Do less than CapCut, but do bachata better.**
