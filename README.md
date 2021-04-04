# [Hitchy](https://core.hitchy.org) has [moved its repositories](https://gitlab.com/hitchy) incl. [this one](https://gitlab.com/hitchy/plugin-proxy).

---

# hitchy-plugin-proxy

hitchy plugin adding support for redirecting requests to remote server

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
		alias: "https://ddg.com/",
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

### Aliases

Every proxy may declare one or more aliases used on mapping URls returned from target back into address space used in request sent to the proxy itself.

> **Example**
>
> In example above a request redirecting to URL `https://duckduckgo.com/index.html` is translated to redirecting to `/ddg/index.html` instead. This translation would fail if target would redirect to `https://ddg.com/index.html` and this URL would be returned from proxy as well. By declaring the alias even this URL would be translated to `/ddg/index.html`.

Aliases are useful e.g. to test and develop backends prepared to run at different URL when in production setup.
