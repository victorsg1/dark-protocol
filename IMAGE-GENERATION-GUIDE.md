# 📸 Phase Card Image Generation Guide

## Overview
Add professional photography images to each of the 6 curriculum phase cards using 21st.dev magic or any AI image generation service.

**Image Specifications:**
- **Dimensions:** 400×500px (portrait orientation)
- **Format:** JPEG or WebP
- **Color Scheme:** Dark background (#0A0A0A, #111111) with gold accents (#C9A96E)
- **Style:** Professional photography, high-end, cinematic lighting
- **File Naming:** phase-01.jpg through phase-06.jpg

---

## Image Generation Prompts

### Phase I — The Iron Mindset
**Prompt:**
```
Professional portrait photography of a confident man with intense, piercing eyes and strong jawline, 
looking directly at camera with unwavering eye contact. Powerful posture, dark background #0A0A0A, 
subtle gold rim lighting on edges creating definition. Studio professional lighting with masculine 
intensity and psychological depth. High-quality professional headshot, 400×500px portrait orientation.
```

**Key Elements:** Confidence, intensity, eye contact, self-mastery, dark studio aesthetic with gold accents

---

### Phase II — The Ignition Protocol
**Prompt:**
```
Professional photography of two people (man and woman) in an intense moment of magnetic eye contact 
and connection. Visible tension between them suggesting attraction and chemistry. Dark background 
#0A0A0A with subtle gold accent lighting creating depth and mood. Mysterious and intimate 
psychological atmosphere. Professional studio lighting, sophisticated dark aesthetic. 
400×500px portrait orientation.
```

**Key Elements:** Connection, attraction, chemistry, tension, dark intimate lighting

---

### Phase III — Dark Influence & Control
**Prompt:**
```
Silhouette photography of a powerful figure in dominant controlling posture with psychological 
authority presence. Dark background #0A0A0A with dramatic gold/amber highlights creating depth 
and visual hierarchy. Mysterious commanding energy with power dynamics visible in body language. 
Professional cinematic lighting, sophisticated dark luxury aesthetic. 400×500px portrait orientation.
```

**Key Elements:** Power, control, dominance, psychological intensity, dramatic lighting

---

### Phase IV — Battlefield Tactics
**Prompt:**
```
Professional photography of a confident man in modern social setting with strategic composed posture. 
Dark modern aesthetic with gold accents and sophisticated ambient lighting. Dynamic confident 
masculine presence with strategic awareness visible in expression and stance. Professional high-end 
lighting suggesting club or upscale bar environment. 400×500px portrait orientation.
```

**Key Elements:** Confidence, strategy, social mastery, modern setting, dynamic energy

---

### Phase V — The Escalation Ladder
**Prompt:**
```
Professional intimate photography of two people with visible psychological and physical tension 
between them suggesting attraction and connection building toward intimacy. Sophisticated dark 
lighting with warm gold accent highlights creating romantic tension. High-end studio professional 
quality, dark luxury aesthetic, emotional depth visible. 400×500px portrait orientation.
```

**Key Elements:** Tension, intimacy, attraction, escalation, sophisticated lighting

---

### Phase VI — The Master's Path
**Prompt:**
```
Professional lifestyle photography of a successful man in premium luxury setting (modern penthouse, 
luxury office, or high-end environment) embodying mastery, sophistication and personal power. 
Dark luxury aesthetic with warm gold accents and professional ambient lighting. Confident powerful 
presence with effortless sophistication visible in posture, surroundings and expression. 
High-end professional quality. 400×500px portrait orientation.
```

**Key Elements:** Success, mastery, luxury, sophistication, personal power, premium aesthetics

---

## Generation Steps

### Option 1: Using 21st.dev Magic
1. Go to https://21st.dev (or your configured magic tool)
2. Paste each prompt above
3. Set dimensions to **400×500px**
4. Generate image
5. Download and save as `phase-0X.jpg`
6. Proceed to **Upload & Integration** section

### Option 2: Using Arcads API (Nano Banana)
```bash
# Example curl command (requires ARCADS_API_KEY in .env)
curl -u "$ARCADS_API_KEY:" \
  -X POST "https://external-api.arcads.ai/v2/images/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-2",
    "prompt": "[paste prompt from above]",
    "resolution": "400x500",
    "projectId": "[your-project-id]"
  }'
```

### Option 3: Using Your Preferred AI Tool
- Midjourney, DALL-E, Stable Diffusion, or any other service
- Ensure 400×500px dimensions
- Match the dark theme and gold accents specification

---

## Upload & Integration

### Step 1: Save Images Locally
```
C:\Users\vrome\Desktop\IA\TODO PARA FB\
├── phase-01.jpg  (Iron Mindset)
├── phase-02.jpg  (Ignition Protocol)
├── phase-03.jpg  (Dark Influence & Control)
├── phase-04.jpg  (Battlefield Tactics)
├── phase-05.jpg  (Escalation Ladder)
└── phase-06.jpg  (Master's Path)
```

### Step 2: Upload to GitHub Pages
```bash
cd C:\Users\vrome\Desktop\IA\TODO PARA FB
git add phase-0*.jpg
git commit -m "Add professional photography images for phase cards"
git push origin main
```

### Step 3: Verify URLs
Images will be available at:
- `https://victorsg1.github.io/dark-protocol/phase-01.jpg`
- `https://victorsg1.github.io/dark-protocol/phase-02.jpg`
- ... etc

The HTML has already been updated to reference these URLs.

---

## Image Delivery Timeline

| Phase | Image | Status |
|-------|-------|--------|
| Phase I | phase-01.jpg | Ready for generation |
| Phase II | phase-02.jpg | Ready for generation |
| Phase III | phase-03.jpg | Ready for generation |
| Phase IV | phase-04.jpg | Ready for generation |
| Phase V | phase-05.jpg | Ready for generation |
| Phase VI | phase-06.jpg | Ready for generation |

---

## Quality Checklist

Before uploading each image, verify:
- ✅ **Dimensions:** Exactly 400×500px
- ✅ **Format:** JPEG or WebP
- ✅ **Color:** Dark backgrounds with gold accents matching brand palette
- ✅ **Quality:** Professional, high-resolution, no artifacts
- ✅ **Style:** Matches the context and phase description
- ✅ **File Size:** <100KB for fast loading
- ✅ **Naming:** phase-0X.jpg (lowercase, zero-padded)

---

## Troubleshooting

**Image not loading on page?**
- Check file is uploaded to GitHub (git push completed)
- Wait 5 minutes for GitHub Pages to cache
- Hard refresh browser (Ctrl+Shift+R)
- Verify URL in browser console

**Image too small/large on page?**
- Check CSS for `.phase-card-image` styling
- Dimensions should be 100% width, auto height within card

**Color doesn't match brand?**
- Regenerate with more specific lighting instructions
- Include "gold accents #C9A96E" explicitly in prompt
- Reference the exact hex colors in generation prompt

---

## Contact & Support
Once images are generated and uploaded, deploy to production:
```bash
git push origin main
```

The page will automatically display the images at:
`https://victorsg1.github.io/dark-protocol/`

