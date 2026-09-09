const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const ENTRIES = [
    'index.html',
    'sun.html',
    'mercury.html',
    'venus.html',
    'earth.html',
    'mars.html',
    'jupiter.html',
    'saturn.html',
    'uranus.html',
    'neptune.html'
];

function localReferences(html)
{
    return Array.from(html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g))
        .map((match) => match[1])
        .filter((reference) => reference.startsWith('./'));
}

function resolveReference(entry, reference)
{
    const target = path.resolve(path.dirname(entry), reference.slice(2));
    assert.ok(
        target === ROOT || target.startsWith(`${ROOT}${path.sep}`),
        `local reference escapes project root: ${reference}`
    );
    return target;
}

function startServer()
{
    const server = http.createServer((request, response) =>
    {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        const target = path.resolve(ROOT, `.${pathname}`);
        if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`))
        {
            response.writeHead(403);
            response.end();
            return;
        }

        fs.readFile(target, (error, content) =>
        {
            if (error)
            {
                response.writeHead(error.code === 'ENOENT' ? 404 : 500);
                response.end();
                return;
            }
            response.writeHead(200);
            response.end(content);
        });
    });

    return new Promise((resolve, reject) =>
    {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () =>
        {
            server.removeListener('error', reject);
            resolve(server);
        });
    });
}

function requestPage(port, entry)
{
    return new Promise((resolve, reject) =>
    {
        http.get({host: '127.0.0.1', port, path: `/${entry}`}, (response) =>
        {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve({
                statusCode: response.statusCode,
                body: Buffer.concat(chunks).toString('utf8')
            }));
        }).on('error', reject);
    });
}

test('all HTML entries serve over HTTP with intact local resources', async () =>
{
    const server = await startServer();
    const {port} = server.address();

    try
    {
        for (const entry of ENTRIES)
        {
            const entryPath = path.join(ROOT, entry);
            const html = fs.readFileSync(entryPath, 'utf8');
            assert.match(html, /<!DOCTYPE html>/i, `${entry} is an HTML document`);

            for (const reference of localReferences(html))
            {
                assert.ok(fs.existsSync(resolveReference(entryPath, reference)), `${entry} -> ${reference}`);
            }

            const response = await requestPage(port, entry);
            assert.equal(response.statusCode, 200, `${entry} responds with HTTP 200`);
            assert.match(response.body, /<html\b/i, `${entry} response contains HTML`);
        }
    }
    finally
    {
        await new Promise((resolve) => server.close(resolve));
    }
});
