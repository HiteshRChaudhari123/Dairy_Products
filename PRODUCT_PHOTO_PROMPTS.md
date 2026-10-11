# Product photo prompts (Gavyora "sky-blue studio" look)

Reference look = `client/public/products/a2-milk.jpg`, `fresh-milk.jpg`, `greek-yogurt.jpg`, `fresh-set-curd.jpg`.
Generate each image with an AI image tool (ChatGPT / Gemini / Ideogram). Attach `a2-milk.jpg` and `fresh-milk.jpg` as style references, paste the **style block** + the product line, then save the result to Downloads named exactly as the file name below (`.jpg` or `.png`). Claude then crops to 800×800, drops it into `client/public/products/` and bumps `IMAGE_VERSION` in `server/src/seed.js`.

## Style block (paste before every product)

> Photorealistic square (1:1) studio product photograph for a premium Indian dairy brand. Background: smooth sky-blue / cornflower-blue paper wall with a slightly lighter blue or white-washed surface, soft natural window light from the left, gentle realistic shadows. Props in the same palette: pale-blue round hatboxes with a white diamond-lattice pattern, white ceramic, blue-and-white patterned porcelain, white linen. Beside the main product (not in front of it) place real natural elements — fresh, in focus, physically resting on the surface with correct contact shadows. Main product sharp, occupying about half the frame, slightly left of centre; shallow depth of field, 50 mm lens, f/2.8, subtle film grain. Clean and airy, no text, no labels, no logos, no people or hands, no cut-out or pasted look.

## Products

| File name | Product line |
|---|---|
| `full-cream-milk.jpg` | A tall clear glass jug of thick full-cream milk and one filled glass on a pale-blue hatbox; a sprig of white baby's-breath flowers on the right. |
| `double-toned-milk.jpg` | Two plain clear tumblers of light milk side by side on the blue surface; a few green mint leaves and a small white daisy beside them. |
| `buffalo-milk.jpg` | A heavy stemmed glass of rich creamy buffalo milk on a white ceramic saucer; a small bunch of dry wheat ears lying to the right. |
| `cow-milk-glass-bottle.jpg` | A 1-litre clear glass milk bottle with a plain white cap, a filled glass next to it, on a pale-blue hatbox; white baby's-breath flowers spilling from the right. |
| `mishti-doi.jpg` | Mishti doi set in a traditional terracotta clay pot (caramel-brown top, one spoonful taken) on a blue-and-white porcelain plate; a few green cardamom pods and a sprig of mint on the side. |
| `organic-curd.jpg` | Thick white curd in a rustic off-white stoneware bowl on white linen over the blue surface; fresh mint sprig and a few whole green cardamom pods beside it. |
| `paneer.jpg` | Fresh white paneer cubes stacked on a white ceramic board with a full paneer block behind; a sprig of coriander and two red cherry tomatoes on the right. |
| `low-fat-paneer.jpg` | A neat rectangular block of low-fat paneer, two slices cut, on a pale-blue plate; a small bunch of mint and a halved lemon to the side. |
| `organic-paneer.jpg` | Rough-cut organic paneer cubes in a blue-and-white porcelain bowl; fresh basil leaves and a few cherry tomatoes on the vine beside it. |
| `soya-tofu.jpg` | A smooth white block of soya tofu on a white ceramic plate, a few cubes cut; green spring onions and a small bowl of soybeans beside it. |
| `a2-bilona-cow-ghee.jpg` | A clear glass jar of grainy golden A2 bilona ghee with a wooden spoon resting in it, on a pale-blue hatbox; a few dry wheat ears and a small brass diya (unlit) to the right. |
| `pure-cow-ghee.jpg` | A wide clear glass jar of golden cow ghee, lid leaning against it, on the blue surface; a sprig of fresh curry leaves and a few marigold petals beside it. |
| `buffalo-ghee.jpg` | A short glass jar of pale, creamy-white buffalo ghee with a small steel spoon, on white linen; a bundle of cinnamon sticks and a few star anise beside it. |
| `white-butter-makhan.jpg` | A soft mound of fresh white makhan in a small terracotta handi on a blue-and-white plate; a wooden butter churner (madhani) lying beside it and a few tulsi leaves. |
| `salted-table-butter.jpg` | A golden butter block on a white ceramic butter dish, one curl shaved off with a butter knife; a sprig of rosemary and a slice of rustic bread to the side. |
| `organic-butter.jpg` | A pale-yellow block of organic butter on a small wooden board over the blue surface; fresh green herbs and a few flakes of sea salt beside it. |
| `fresh-cream.jpg` | Softly whipped fresh cream in a white ceramic bowl with a spoon; two fresh strawberries and a mint sprig beside the bowl. |
| `mozzarella-cheese.jpg` | Two fresh white mozzarella balls on a blue-and-white porcelain plate, one sliced; fresh basil leaves and cherry tomatoes on the vine to the right. |
| `cheese.jpg` | A wedge and a few cubes of orange cheddar cheese on a white board; green grapes and a couple of walnuts beside it. |
| `cheese-spread-garlic.jpg` | A small glass jar of creamy white garlic cheese spread with a butter knife, a cracker spread with it; two whole garlic bulbs and a sprig of parsley beside it. |
| `masala-chaas.jpg` | A tall clear glass of spiced chaas (buttermilk) with a pinch of roasted cumin on top; fresh coriander and mint sprigs and a small green chilli beside it. |
| `sweet-lassi.jpg` | A tall glass of thick sweet lassi topped with malai and a few rose petals; a sprig of white baby's-breath flowers on the right. |
| `mango-lassi.jpg` | A tall glass of bright mango lassi; a ripe Alphonso mango, one half cut, and a mint sprig beside it. |
| `kesar-badam-milk.jpg` | Two small glasses of saffron-yellow kesar badam milk garnished with slivered almonds; a small bowl of almonds and a few saffron threads on the side. |
| `malai-kulfi.jpg` | Three malai kulfis on sticks resting on a blue-and-white plate, sprinkled with chopped pistachio; a few green cardamom pods and pistachios beside them. |
| `vanilla-real-milk-ice-cream.jpg` | Two scoops of vanilla ice cream in a white ceramic bowl with tiny black vanilla seeds visible; two whole vanilla pods and a sprig of baby's-breath beside it. |
| `alphonso-mango-ice-cream.jpg` | Two scoops of Alphonso mango ice cream in a white bowl; fresh mango cubes and a mint sprig beside it. |
| `kaju-katli.jpg` | Diamond-shaped kaju katli with silver leaf neatly stacked on a white ceramic plate; a small heap of whole cashews beside it. |
| `rasgulla.jpg` | Four white rasgullas in light syrup in a blue-and-white porcelain bowl; a few rose petals and green cardamom pods beside it. |
| `milk-peda.jpg` | Round pale-cream milk pedas, each topped with a pistachio sliver and a saffron strand, on a white plate; a few saffron threads and pistachios beside it. |

Already in the reference look (no change needed): `a2-milk.jpg`, `fresh-milk.jpg`, `greek-yogurt.jpg`, `fresh-set-curd.jpg`.
