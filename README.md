# hitchy-plugin-proxy

hitchy extension adding support for redirecting requests to remote server

## License

[MIT](LICENSE)

## Installation

```bash
npm i -S hitchy-plugin-proxy
```

## Configuration

Create a file **config/proxy.js** in your Hitchy-based project. This file contains all proxy configurations:

```javascript
exports.proxy = [
	{
		prefix: "/ddg",
		target: "https://duckduckgo.com/",
	},
	{
		prefix: "/denic",
		target: "https://www.denic.de",
	},
];
```

The exported list must be named **proxy**. It consists of objects each declaring a routing prefix and a target all requests matching prefix are mapped onto. Additional options may be introduced in future and should be provided here as well.

> **Example:**
> 
> The configuration above is creating two reverse proxies: The first one is forwarding all requests for routes starting with **/ddg** to the base URL **https://duckduckgo.com** so that requesting **/ddg/assets/dax.svg** will eventually deliver the resource available at **https://duckduckgo.com/assets/dax.svg**. The second one is forwarding requests with prefix **/denic** to **http://www.denic.de**.
