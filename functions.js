// async function loadJSON(path) {
//     const response = await fetch(path);
//     return await response.json();
// }

let zipFS = {}; // { 'package/servers/index.json': <json data>, ... }

async function loadZip(file) {
    zipFS = {};
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const entries = Object.keys(zip.files);

    for (const path of entries) {
        const fileObj = zip.files[path];

        // 🔽 条件：JSONファイルかつディレクトリじゃない
        if (!fileObj.dir && path.endsWith('.json')) {
            try {
                const content = await fileObj.async("string");
                zipFS[path] = JSON.parse(content);
            } catch (e) {
                console.warn("JSONパース失敗:", path, e);
            }
        }
    }

    console.log("[ZIP読み込み完了]", Object.keys(zipFS));
}


async function loadJSON(path) {
    path = path.replace('package/', '');
    if (zipFS[path]) {
        return zipFS[path];
    } else {
        console.warn("仮想ファイルに存在しないパス:", path);
        return {};
    }
}
