# Промпты для перегенерации elite-modern (по ДНК)

Собраны: `python3 tools/prompt-build.py interior --dna examples/dna/elite-modern.json --room <key> [--evening]`.
ДНК восстановлена по карточке проекта (`site/portfolio/gost-elitemodern/_card.json`) — перед генерацией её должен подтвердить дизайнер.
Генерация платная (router.cheap) — запускает оператор. Если генерация идёт по clay-кадру, сначала добавьте в 3D-сцену ореховую панель ТВ-зоны, скрытые двери и нишу под шторы: промпт архитектуру не дорисует.

## living (вечер)

```text
TASK:
Photorealistic interior photograph of one room for a high-end design magazine, taken at about 1.2 m above the floor with a 24–28 mm lens and shift correction, so all vertical lines stay perfectly vertical.

COMPOSITION:
Either a one-point view along the main axis of the room or a two-point view from a corner along the diagonal. The frame shows the room's feature wall and its hero piece in full, never cut through the middle. Foreground, middle ground and background are all present, giving the image depth; one quiet foreground element (the edge of a chair, a side table) frames the view.

DESIGN DNA — THE IDEA THAT EVERY FRAME OF THIS PROJECT SHARES:
Dark walnut wraps pale veined marble: the apartment reads as a fine case built around a collection.
Three signature moves. Show every move that fits this room's function: all three in living rooms, kitchens and bedrooms, at least two in bathrooms, halls and service rooms:
- floor-to-ceiling American walnut veneer wall panelling with a 10 mm shadow gap, one feature wall per room, visible open wood grain, matte oiled finish
- pale marble with bold grey-taupe veining used as sculptural monoliths with thick visible edges, not as thin cladding
- brushed satin brass only at touch points: handles, taps, thin inlays and edge trims, never large brass surfaces
Palette: warm ivory walls, sand and taupe support tones, deep walnut-brown anchor, one muted green-grey accent, satin brass.

SCENE AND STYLE:
living room: full-height walnut panel wall with a flush-integrated TV niche and concealed storage; hero piece a low modular ivory boucle sofa centred on the panel axis; one deep green velvet lounge chair as the dark accent; a thick marble coffee table monolith; large-format black-and-white photograph on the side wall

ELITE STUDIO LEVEL — ARCHITECTURE BEFORE FURNITURE:
This is a portfolio image for a high-end interior design studio. The room must be resolved by architecture, not by furniture: remove the furniture and the space should still look designed.
- Doors are flush, concealed-frame leaves, full height or close to the ceiling, without architraves, in the plane of the wall or the panelling.
- No visible panel radiators: heating is a trench convector at the window or hidden behind a grille in a niche finished like the wall.
- Curtains fall floor to ceiling from a concealed ceiling pocket, never from a rod on the wall.
- The ceiling has a perimeter shadow gap and linear or concealed light; no grid of round downlights.
- Storage, TV and appliances are built in and flush; no visible cables, no wall-mounted AC unit.
- One feature wall per room carries the project's main material; the main furniture group sits on a clear axis of that wall, a window or a niche.
- Skirting is a shadow gap or a low skirting painted in the wall colour.

STYLING — RESTRAINT:
One hero piece per room; everything else is quiet. Three to five styling objects in the whole frame: a stack of books, one handmade ceramic vessel, a branch in water, a folded throw. Cushions match the upholstery with at most one accent from the project palette. Art is large-format black-and-white photography, graphic print, relief or ceramic — never a painted landscape in a gilded frame and never abstract art with gold arcs.

ROOM FUNCTION:
Never add furniture that does not belong to the room's function — a storage room, closet, laundry or toilet gets no sofa, no TV, no armchair and no coffee table. Washing machines and dryers are hidden behind flush fronts.

PRIMARY MATERIALS — THE ROOM'S SURFACES ARE BUILT FROM THESE, EACH A REAL TACTILE SURFACE:
American walnut veneer, matte oil finish, open grain; honed pale marble with bold grey-taupe veining; brushed satin brass; ivory boucle and wool upholstery with visible loop texture; warm white textured lime plaster walls with soft tonal movement.
Floor throughout: wide-plank engineered oak floor in a deep smoked tone, matte oil, the same marble in wet areas.
Do not introduce other wood species, stones or metals.
Avoid in this project: cushions in two random contrasting colours; landscape painting in a gilded frame, abstract art with gold arcs; visible panel radiators; standard doors with architraves; grid of recessed downlights.

LIGHT:
Warm 2700K light that is mostly indirect: concealed LED washing the walnut panels and niches, wall sconces and a floor lamp; ceiling with a perimeter shadow gap and one linear light slot, no grid of downlights. Blue-hour dusk outside the window, all concealed LED lines and lamps on, warm pools of light, deep but readable shadows.

RENDER QUALITY AND CAMERA:
Professional architectural visualization made in a high-end studio, physically based rendering, global illumination with realistic light bounce, soft ambient occlusion in corners and under furniture, accurate contact shadows, 4K material textures with visible grain and weave, subtle chromatic richness, filmic colour grading, clean sharp focus across the whole frame, no lens distortion.

DO NOT INCLUDE:
No people, no pets, no text, no numbers, no dimension lines, no room labels, no title block, no watermark, no logos. No warped or melted geometry, no duplicated furniture, no objects floating above the floor, no doors opening into walls, no furniture clipping through walls.
```

## living

```text
TASK:
Photorealistic interior photograph of one room for a high-end design magazine, taken at about 1.2 m above the floor with a 24–28 mm lens and shift correction, so all vertical lines stay perfectly vertical.

COMPOSITION:
Either a one-point view along the main axis of the room or a two-point view from a corner along the diagonal. The frame shows the room's feature wall and its hero piece in full, never cut through the middle. Foreground, middle ground and background are all present, giving the image depth; one quiet foreground element (the edge of a chair, a side table) frames the view.

DESIGN DNA — THE IDEA THAT EVERY FRAME OF THIS PROJECT SHARES:
Dark walnut wraps pale veined marble: the apartment reads as a fine case built around a collection.
Three signature moves. Show every move that fits this room's function: all three in living rooms, kitchens and bedrooms, at least two in bathrooms, halls and service rooms:
- floor-to-ceiling American walnut veneer wall panelling with a 10 mm shadow gap, one feature wall per room, visible open wood grain, matte oiled finish
- pale marble with bold grey-taupe veining used as sculptural monoliths with thick visible edges, not as thin cladding
- brushed satin brass only at touch points: handles, taps, thin inlays and edge trims, never large brass surfaces
Palette: warm ivory walls, sand and taupe support tones, deep walnut-brown anchor, one muted green-grey accent, satin brass.

SCENE AND STYLE:
living room: full-height walnut panel wall with a flush-integrated TV niche and concealed storage; hero piece a low modular ivory boucle sofa centred on the panel axis; one deep green velvet lounge chair as the dark accent; a thick marble coffee table monolith; large-format black-and-white photograph on the side wall

ELITE STUDIO LEVEL — ARCHITECTURE BEFORE FURNITURE:
This is a portfolio image for a high-end interior design studio. The room must be resolved by architecture, not by furniture: remove the furniture and the space should still look designed.
- Doors are flush, concealed-frame leaves, full height or close to the ceiling, without architraves, in the plane of the wall or the panelling.
- No visible panel radiators: heating is a trench convector at the window or hidden behind a grille in a niche finished like the wall.
- Curtains fall floor to ceiling from a concealed ceiling pocket, never from a rod on the wall.
- The ceiling has a perimeter shadow gap and linear or concealed light; no grid of round downlights.
- Storage, TV and appliances are built in and flush; no visible cables, no wall-mounted AC unit.
- One feature wall per room carries the project's main material; the main furniture group sits on a clear axis of that wall, a window or a niche.
- Skirting is a shadow gap or a low skirting painted in the wall colour.

STYLING — RESTRAINT:
One hero piece per room; everything else is quiet. Three to five styling objects in the whole frame: a stack of books, one handmade ceramic vessel, a branch in water, a folded throw. Cushions match the upholstery with at most one accent from the project palette. Art is large-format black-and-white photography, graphic print, relief or ceramic — never a painted landscape in a gilded frame and never abstract art with gold arcs.

ROOM FUNCTION:
Never add furniture that does not belong to the room's function — a storage room, closet, laundry or toilet gets no sofa, no TV, no armchair and no coffee table. Washing machines and dryers are hidden behind flush fronts.

PRIMARY MATERIALS — THE ROOM'S SURFACES ARE BUILT FROM THESE, EACH A REAL TACTILE SURFACE:
American walnut veneer, matte oil finish, open grain; honed pale marble with bold grey-taupe veining; brushed satin brass; ivory boucle and wool upholstery with visible loop texture; warm white textured lime plaster walls with soft tonal movement.
Floor throughout: wide-plank engineered oak floor in a deep smoked tone, matte oil, the same marble in wet areas.
Do not introduce other wood species, stones or metals.
Avoid in this project: cushions in two random contrasting colours; landscape painting in a gilded frame, abstract art with gold arcs; visible panel radiators; standard doors with architraves; grid of recessed downlights.

LIGHT:
Warm 2700K light that is mostly indirect: concealed LED washing the walnut panels and niches, wall sconces and a floor lamp; ceiling with a perimeter shadow gap and one linear light slot, no grid of downlights. Soft side daylight from the window, gentle long shadows, interior accent lights faintly on.

RENDER QUALITY AND CAMERA:
Professional architectural visualization made in a high-end studio, physically based rendering, global illumination with realistic light bounce, soft ambient occlusion in corners and under furniture, accurate contact shadows, 4K material textures with visible grain and weave, subtle chromatic richness, filmic colour grading, clean sharp focus across the whole frame, no lens distortion.

DO NOT INCLUDE:
No people, no pets, no text, no numbers, no dimension lines, no room labels, no title block, no watermark, no logos. No warped or melted geometry, no duplicated furniture, no objects floating above the floor, no doors opening into walls, no furniture clipping through walls.
```

## bedroom

```text
TASK:
Photorealistic interior photograph of one room for a high-end design magazine, taken at about 1.2 m above the floor with a 24–28 mm lens and shift correction, so all vertical lines stay perfectly vertical.

COMPOSITION:
Either a one-point view along the main axis of the room or a two-point view from a corner along the diagonal. The frame shows the room's feature wall and its hero piece in full, never cut through the middle. Foreground, middle ground and background are all present, giving the image depth; one quiet foreground element (the edge of a chair, a side table) frames the view.

DESIGN DNA — THE IDEA THAT EVERY FRAME OF THIS PROJECT SHARES:
Dark walnut wraps pale veined marble: the apartment reads as a fine case built around a collection.
Three signature moves. Show every move that fits this room's function: all three in living rooms, kitchens and bedrooms, at least two in bathrooms, halls and service rooms:
- floor-to-ceiling American walnut veneer wall panelling with a 10 mm shadow gap, one feature wall per room, visible open wood grain, matte oiled finish
- pale marble with bold grey-taupe veining used as sculptural monoliths with thick visible edges, not as thin cladding
- brushed satin brass only at touch points: handles, taps, thin inlays and edge trims, never large brass surfaces
Palette: warm ivory walls, sand and taupe support tones, deep walnut-brown anchor, one muted green-grey accent, satin brass.

SCENE AND STYLE:
bedroom: full-width walnut panelled headboard wall with concealed warm LED, bed centred on the panel axis, ivory and taupe bedding with one graphite linen throw, curtains falling from a concealed ceiling pocket to the floor, brass wall sconces, no visible radiator

ELITE STUDIO LEVEL — ARCHITECTURE BEFORE FURNITURE:
This is a portfolio image for a high-end interior design studio. The room must be resolved by architecture, not by furniture: remove the furniture and the space should still look designed.
- Doors are flush, concealed-frame leaves, full height or close to the ceiling, without architraves, in the plane of the wall or the panelling.
- No visible panel radiators: heating is a trench convector at the window or hidden behind a grille in a niche finished like the wall.
- Curtains fall floor to ceiling from a concealed ceiling pocket, never from a rod on the wall.
- The ceiling has a perimeter shadow gap and linear or concealed light; no grid of round downlights.
- Storage, TV and appliances are built in and flush; no visible cables, no wall-mounted AC unit.
- One feature wall per room carries the project's main material; the main furniture group sits on a clear axis of that wall, a window or a niche.
- Skirting is a shadow gap or a low skirting painted in the wall colour.

STYLING — RESTRAINT:
One hero piece per room; everything else is quiet. Three to five styling objects in the whole frame: a stack of books, one handmade ceramic vessel, a branch in water, a folded throw. Cushions match the upholstery with at most one accent from the project palette. Art is large-format black-and-white photography, graphic print, relief or ceramic — never a painted landscape in a gilded frame and never abstract art with gold arcs.

ROOM FUNCTION:
Never add furniture that does not belong to the room's function — a storage room, closet, laundry or toilet gets no sofa, no TV, no armchair and no coffee table. Washing machines and dryers are hidden behind flush fronts.

PRIMARY MATERIALS — THE ROOM'S SURFACES ARE BUILT FROM THESE, EACH A REAL TACTILE SURFACE:
American walnut veneer, matte oil finish, open grain; honed pale marble with bold grey-taupe veining; brushed satin brass; ivory boucle and wool upholstery with visible loop texture; warm white textured lime plaster walls with soft tonal movement.
Floor throughout: wide-plank engineered oak floor in a deep smoked tone, matte oil, the same marble in wet areas.
Do not introduce other wood species, stones or metals.
Avoid in this project: cushions in two random contrasting colours; landscape painting in a gilded frame, abstract art with gold arcs; visible panel radiators; standard doors with architraves; grid of recessed downlights.

LIGHT:
Warm 2700K light that is mostly indirect: concealed LED washing the walnut panels and niches, wall sconces and a floor lamp; ceiling with a perimeter shadow gap and one linear light slot, no grid of downlights. Soft side daylight from the window, gentle long shadows, interior accent lights faintly on.

RENDER QUALITY AND CAMERA:
Professional architectural visualization made in a high-end studio, physically based rendering, global illumination with realistic light bounce, soft ambient occlusion in corners and under furniture, accurate contact shadows, 4K material textures with visible grain and weave, subtle chromatic richness, filmic colour grading, clean sharp focus across the whole frame, no lens distortion.

DO NOT INCLUDE:
No people, no pets, no text, no numbers, no dimension lines, no room labels, no title block, no watermark, no logos. No warped or melted geometry, no duplicated furniture, no objects floating above the floor, no doors opening into walls, no furniture clipping through walls.
```

## study

```text
TASK:
Photorealistic interior photograph of one room for a high-end design magazine, taken at about 1.2 m above the floor with a 24–28 mm lens and shift correction, so all vertical lines stay perfectly vertical.

COMPOSITION:
Either a one-point view along the main axis of the room or a two-point view from a corner along the diagonal. The frame shows the room's feature wall and its hero piece in full, never cut through the middle. Foreground, middle ground and background are all present, giving the image depth; one quiet foreground element (the edge of a chair, a side table) frames the view.

DESIGN DNA — THE IDEA THAT EVERY FRAME OF THIS PROJECT SHARES:
Dark walnut wraps pale veined marble: the apartment reads as a fine case built around a collection.
Three signature moves. Show every move that fits this room's function: all three in living rooms, kitchens and bedrooms, at least two in bathrooms, halls and service rooms:
- floor-to-ceiling American walnut veneer wall panelling with a 10 mm shadow gap, one feature wall per room, visible open wood grain, matte oiled finish
- pale marble with bold grey-taupe veining used as sculptural monoliths with thick visible edges, not as thin cladding
- brushed satin brass only at touch points: handles, taps, thin inlays and edge trims, never large brass surfaces
Palette: warm ivory walls, sand and taupe support tones, deep walnut-brown anchor, one muted green-grey accent, satin brass.

SCENE AND STYLE:
study: walnut built-in library wall with lit shelves, solid walnut desk on the window axis, leather desk chair, curated books and two ceramic objects only

ELITE STUDIO LEVEL — ARCHITECTURE BEFORE FURNITURE:
This is a portfolio image for a high-end interior design studio. The room must be resolved by architecture, not by furniture: remove the furniture and the space should still look designed.
- Doors are flush, concealed-frame leaves, full height or close to the ceiling, without architraves, in the plane of the wall or the panelling.
- No visible panel radiators: heating is a trench convector at the window or hidden behind a grille in a niche finished like the wall.
- Curtains fall floor to ceiling from a concealed ceiling pocket, never from a rod on the wall.
- The ceiling has a perimeter shadow gap and linear or concealed light; no grid of round downlights.
- Storage, TV and appliances are built in and flush; no visible cables, no wall-mounted AC unit.
- One feature wall per room carries the project's main material; the main furniture group sits on a clear axis of that wall, a window or a niche.
- Skirting is a shadow gap or a low skirting painted in the wall colour.

STYLING — RESTRAINT:
One hero piece per room; everything else is quiet. Three to five styling objects in the whole frame: a stack of books, one handmade ceramic vessel, a branch in water, a folded throw. Cushions match the upholstery with at most one accent from the project palette. Art is large-format black-and-white photography, graphic print, relief or ceramic — never a painted landscape in a gilded frame and never abstract art with gold arcs.

ROOM FUNCTION:
Never add furniture that does not belong to the room's function — a storage room, closet, laundry or toilet gets no sofa, no TV, no armchair and no coffee table. Washing machines and dryers are hidden behind flush fronts.

PRIMARY MATERIALS — THE ROOM'S SURFACES ARE BUILT FROM THESE, EACH A REAL TACTILE SURFACE:
American walnut veneer, matte oil finish, open grain; honed pale marble with bold grey-taupe veining; brushed satin brass; ivory boucle and wool upholstery with visible loop texture; warm white textured lime plaster walls with soft tonal movement.
Floor throughout: wide-plank engineered oak floor in a deep smoked tone, matte oil, the same marble in wet areas.
Do not introduce other wood species, stones or metals.
Avoid in this project: cushions in two random contrasting colours; landscape painting in a gilded frame, abstract art with gold arcs; visible panel radiators; standard doors with architraves; grid of recessed downlights.

LIGHT:
Warm 2700K light that is mostly indirect: concealed LED washing the walnut panels and niches, wall sconces and a floor lamp; ceiling with a perimeter shadow gap and one linear light slot, no grid of downlights. Soft side daylight from the window, gentle long shadows, interior accent lights faintly on.

RENDER QUALITY AND CAMERA:
Professional architectural visualization made in a high-end studio, physically based rendering, global illumination with realistic light bounce, soft ambient occlusion in corners and under furniture, accurate contact shadows, 4K material textures with visible grain and weave, subtle chromatic richness, filmic colour grading, clean sharp focus across the whole frame, no lens distortion.

DO NOT INCLUDE:
No people, no pets, no text, no numbers, no dimension lines, no room labels, no title block, no watermark, no logos. No warped or melted geometry, no duplicated furniture, no objects floating above the floor, no doors opening into walls, no furniture clipping through walls.
```

## bath

```text
TASK:
Photorealistic interior photograph of one room for a high-end design magazine, taken at about 1.2 m above the floor with a 24–28 mm lens and shift correction, so all vertical lines stay perfectly vertical.

COMPOSITION:
Either a one-point view along the main axis of the room or a two-point view from a corner along the diagonal. The frame shows the room's feature wall and its hero piece in full, never cut through the middle. Foreground, middle ground and background are all present, giving the image depth; one quiet foreground element (the edge of a chair, a side table) frames the view.

DESIGN DNA — THE IDEA THAT EVERY FRAME OF THIS PROJECT SHARES:
Dark walnut wraps pale veined marble: the apartment reads as a fine case built around a collection.
Three signature moves. Show every move that fits this room's function: all three in living rooms, kitchens and bedrooms, at least two in bathrooms, halls and service rooms:
- floor-to-ceiling American walnut veneer wall panelling with a 10 mm shadow gap, one feature wall per room, visible open wood grain, matte oiled finish
- pale marble with bold grey-taupe veining used as sculptural monoliths with thick visible edges, not as thin cladding
- brushed satin brass only at touch points: handles, taps, thin inlays and edge trims, never large brass surfaces
Palette: warm ivory walls, sand and taupe support tones, deep walnut-brown anchor, one muted green-grey accent, satin brass.

SCENE AND STYLE:
bathroom: a thick marble monolith vanity with a 60 mm visible edge and a marble shower tray, warm white lime plaster walls, one walnut panelled wall behind the freestanding bath, brushed brass taps, frameless glass shower, recessed niche with LED, no visible pipes

ELITE STUDIO LEVEL — ARCHITECTURE BEFORE FURNITURE:
This is a portfolio image for a high-end interior design studio. The room must be resolved by architecture, not by furniture: remove the furniture and the space should still look designed.
- Doors are flush, concealed-frame leaves, full height or close to the ceiling, without architraves, in the plane of the wall or the panelling.
- No visible panel radiators: heating is a trench convector at the window or hidden behind a grille in a niche finished like the wall.
- Curtains fall floor to ceiling from a concealed ceiling pocket, never from a rod on the wall.
- The ceiling has a perimeter shadow gap and linear or concealed light; no grid of round downlights.
- Storage, TV and appliances are built in and flush; no visible cables, no wall-mounted AC unit.
- One feature wall per room carries the project's main material; the main furniture group sits on a clear axis of that wall, a window or a niche.
- Skirting is a shadow gap or a low skirting painted in the wall colour.

STYLING — RESTRAINT:
One hero piece per room; everything else is quiet. Three to five styling objects in the whole frame: a stack of books, one handmade ceramic vessel, a branch in water, a folded throw. Cushions match the upholstery with at most one accent from the project palette. Art is large-format black-and-white photography, graphic print, relief or ceramic — never a painted landscape in a gilded frame and never abstract art with gold arcs.

ROOM FUNCTION:
Never add furniture that does not belong to the room's function — a storage room, closet, laundry or toilet gets no sofa, no TV, no armchair and no coffee table. Washing machines and dryers are hidden behind flush fronts.

PRIMARY MATERIALS — THE ROOM'S SURFACES ARE BUILT FROM THESE, EACH A REAL TACTILE SURFACE:
American walnut veneer, matte oil finish, open grain; honed pale marble with bold grey-taupe veining; brushed satin brass; ivory boucle and wool upholstery with visible loop texture; warm white textured lime plaster walls with soft tonal movement.
Floor throughout: wide-plank engineered oak floor in a deep smoked tone, matte oil, the same marble in wet areas.
Do not introduce other wood species, stones or metals.
Avoid in this project: cushions in two random contrasting colours; landscape painting in a gilded frame, abstract art with gold arcs; visible panel radiators; standard doors with architraves; grid of recessed downlights.

LIGHT:
Warm 2700K light that is mostly indirect: concealed LED washing the walnut panels and niches, wall sconces and a floor lamp; ceiling with a perimeter shadow gap and one linear light slot, no grid of downlights. Soft side daylight from the window, gentle long shadows, interior accent lights faintly on.

RENDER QUALITY AND CAMERA:
Professional architectural visualization made in a high-end studio, physically based rendering, global illumination with realistic light bounce, soft ambient occlusion in corners and under furniture, accurate contact shadows, 4K material textures with visible grain and weave, subtle chromatic richness, filmic colour grading, clean sharp focus across the whole frame, no lens distortion.

DO NOT INCLUDE:
No people, no pets, no text, no numbers, no dimension lines, no room labels, no title block, no watermark, no logos. No warped or melted geometry, no duplicated furniture, no objects floating above the floor, no doors opening into walls, no furniture clipping through walls.
```
