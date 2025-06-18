var servers = [];

async function init() {
    await laodServerJSONs();
    createServersElements();
}

document.getElementById('zip_file_input').addEventListener('change', async (e) => {
    document.getElementById('messages').innerHTML = 'loading...';
    const file = e.target.files[0];
    await loadZip(file);
    init(); // ←ZIPが読み込まれたあとにUI生成をスタート
    document.getElementById('messages').innerHTML = 'load complete';
});

function createServersElements() {
    document.getElementById('guilds').innerHTML = '';
    for (let i = 0; i < servers.length; i++) {
        let server = servers[i];
        let serverElement = document.createElement('button');
        serverElement.classList.add('server');
        serverElement.id = 'server-' + server.id;
        serverElement.dataset.index = i;
        serverElement.innerHTML = server.name;
        serverElement.addEventListener('click', () => { createChannelsElements(i) });
        document.getElementById('guilds').appendChild(serverElement);
    }
}

function createChannelsElements(server_idndex) {
    document.getElementById('channels').innerHTML = '';
    for (let channel of servers[server_idndex].channels) {
        let channelElement = document.createElement('button');
        channelElement.classList.add('channel');
        channelElement.id = 'channel-' + channel.id;
        channelElement.innerHTML = channel.name;
        channelElement.addEventListener('click', () => { createMessagesElements(channel.id) });
        if (displaySearchResult) {
            for (let result of searchResult) {
                if (result.channel.id == channel.id) {
                    channelElement.classList.add('matched');
                    break;
                }
            }
        }
        document.getElementById('channels').appendChild(channelElement);
    }
}

async function createMessagesElements(channel_id) {
    let server = servers.find((server) => { return server.channels.find((channel) => { return channel.id == channel_id }) });
    let channel = server.channels.find((channel) => { return channel.id == channel_id });
    document.getElementById('messages').innerHTML = `<p>#${channel.name}</p>`;
    let messages = await loadMessagesJSON(channel_id);
    console.log(messages);
    for (let message of messages) {
        let messageElement = document.createElement('div');
        messageElement.id = 'message-' + message.ID;
        messageElement.classList.add('message');

        let contents = message.Contents;
        let attachments = message.Attachments;
        let timestamp = message.Timestamp;

        messageElement.innerHTML = `<div class="timestamp">${timestamp}</div>
            <div class="contents">${contents}</div>`;

        if (attachments) {
            let attachmentElement = document.createElement('img');
            attachmentElement.src = attachments;
            messageElement.appendChild(attachmentElement);
        }

        if (displaySearchResult) {
            for (let result of searchResult) {
                if (result.message.ID == message.ID) {
                    messageElement.classList.add('matched');
                    break;
                }
            }
        }

        document.getElementById('messages').appendChild(messageElement);
    }
}

async function loadMessagesJSON(channel_id) {
    let server = servers.find((server) => { return server.channels.find((channel) => { return channel.id == channel_id }) });
    if (!server) {
        console.log('server not found');
        console.log(channel_id);
        return [];
    }
    let channel = server.channels?.find((channel) => { return channel.id == channel_id });
    if (!channel) {
        console.log('channel not found');
        console.log(channel_id, server);
        return [];
    }
    if (channel.messages.length > 0) return channel.messages;
    let messages = await loadJSON(`package/messages/c${channel_id}/messages.json`);
    channel.messages = messages;
    return messages;
}

async function laodServerJSONs() {
    let servers_index = await loadJSON('package/servers/index.json');
    servers_index = Object.keys(servers_index).map((k) => { return { id: k, name: servers_index[k], channels: [] } }).reverse();
    servers.push({ id: 0, name: 'Direct Message', channels: [] });
    servers.push(...servers_index);
    servers.push({ id: 0, name: 'Unknown', channels: [] });

    messages_index = await loadJSON('package/messages/index.json');
    messages_index = Object.keys(messages_index).map((k) => { return { id: k, name: messages_index[k] } }).reverse();

    for (let mess_channel of messages_index) {
        let flag = false;

        if (mess_channel.name.search(`Direct Message with`) != -1) {
            servers[0].channels.push({ id: mess_channel.id, name: mess_channel.name.replace('Direct Message with ', ''), messages: [] });
            flag = true;
        } else {

            for (let server of servers) {
                if (mess_channel.name.search(`in ${server.name}`) != -1) {
                    server.channels.push({ id: mess_channel.id, name: mess_channel.name.replace(` in ${server.name}`, ''), messages: [] });
                    flag = true;
                    break;
                }
            }

        }

        if (!flag) {
            servers[servers.length - 1].channels.push({ id: mess_channel.id, name: mess_channel.name, messages: [] });
        }

        await loadMessagesJSON(mess_channel.id);
    }

    console.log(servers);
}

// init();



var displaySearchResult = false;
var searchResult = [];
function searchInAllMessages(query) {
    let results = [];

    [...document.querySelectorAll('.matched')].forEach(e => e.classList.remove('matched'));

    if (query.trim() != '') {

        const ast = parseQuery(query.toLowerCase());

        for (let server of servers) {
            for (let channel of server.channels) {
                for (let message of channel.messages) {
                    let content = (message.Contents || "").toLowerCase();

                    if (evaluateQuery(ast, content)) {
                        results.push({
                            server: server,
                            channel: channel,
                            message: message,
                            text: message.Contents
                        });
                    }
                }
            }
        }
    }

    console.log(results);
    searchResult = results;

    if (results.length == 0) {
        displaySearchResult = false;
        return results;
    }
    document.body.classList.add('matched');
    displaySearchResult = true;

    for (let result of results) {
        let messageElement = document.getElementById(`message-${result.message.ID}`);
        messageElement?.classList.add('matched');
        let channelElement = document.getElementById(`channel-${result.channel.id}`);
        channelElement?.classList.add('matched');
        let serverElement = document.getElementById(`server-${result.server.id}`);
        serverElement?.classList.add('matched');
        console.log(messageElement, channelElement, serverElement);
    }

    return results;
}

// -----------------------------
// ▼ 1. クエリをパース（AST生成）
// -----------------------------
function parseQuery(query) {
    // トークナイズ：単語、AND/OR、括弧
    // let tokens = query.match(/\(|\)|\w+|and|or/gi)?.map(t => t.toLowerCase());
    let tokens = query.match(/\(|\)|"[^"]+"|\S+/g)?.map(t => t.toLowerCase());

    if (!tokens) return { type: "term", value: query };

    function parseExpr() {
        let stack = [];
        let token;

        while ((token = tokens.shift())) {
            if (token === "(") {
                stack.push(parseExpr());
            } else if (token === ")") {
                break;
            } else if (token === "and" || token === "or") {
                stack.push(token);
            } else {
                stack.push({ type: "term", value: token });
            }
        }

        // AND優先で結合
        return buildAST(stack);
    }

    function buildAST(tokens) {
        // AND優先 → (A and B) or C
        let i;
        while ((i = tokens.findIndex(t => t === "and")) !== -1) {
            tokens.splice(i - 1, 3, {
                type: "and",
                left: tokens[i - 1],
                right: tokens[i + 1],
            });
        }

        while ((i = tokens.findIndex(t => t === "or")) !== -1) {
            tokens.splice(i - 1, 3, {
                type: "or",
                left: tokens[i - 1],
                right: tokens[i + 1],
            });
        }

        return tokens[0];
    }

    return parseExpr();
}

// -----------------------------
// ▼ 2. ASTを評価（contentに当てはめる）
// -----------------------------
function evaluateQuery(node, content) {
    switch (node?.type) {
        case "term":
            return content.includes(node.value);
        case "and":
            return evaluateQuery(node.left, content) && evaluateQuery(node.right, content);
        case "or":
            return evaluateQuery(node.left, content) || evaluateQuery(node.right, content);
        default:
            return false;
    }
}
