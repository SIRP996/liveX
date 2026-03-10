import http from 'http';

const data = JSON.stringify({ ids: ['test1', 'test2'] });
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/channels/bulk',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});
req.on('error', (e) => console.error(e));
req.write(data);
req.end();
