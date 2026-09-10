// ==UserScript==
// @name         Rule34 Mass Download Button
// @namespace    https://rule34.xxx/
// @version      1.5.0
// @description  Downloads every post image from each page using image tags as filenames.
// @match        https://rule34.xxx/*
// @match        https://www.rule34.xxx/*
// @updateURL    https://raw.githubusercontent.com/moz-1337/r34/main/mass-download.user.js
// @downloadURL  https://raw.githubusercontent.com/moz-1337/r34/main/mass-download.user.js
// @grant        GM_xmlhttpRequest
// @connect      rule34.xxx
// @connect      www.rule34.xxx
// @connect      wimg.rule34.xxx
// ==/UserScript==

(function () {
    'use strict';

    const requestDelay = 500;
    let requestCount = 0;

    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function request(url, responseType = 'text') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(responseType === 'blob' ? response.response : response.responseText);
                    } else {
                        reject(new Error(`Request failed with status ${response.status}`));
                    }
                },
                onerror: () => reject(new Error(`Could not fetch ${url}`))
            });
        });
    }

    async function pacedRequest(url, responseType = 'text') {
        if (requestCount > 0) {
            await wait(requestDelay);
        }

        requestCount += 1;
        return request(url, responseType);
    }

    function filenameFromAlt(alt, imageUrl) {
        const tags = alt.trim().replace(/\s+/g, ' ');
        const extension = new URL(imageUrl).pathname.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg';
        const safeTags = tags.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180) || 'rule34-image';
        return `${safeTags}${extension}`;
    }

    function downloadBlob(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    function addMassDownloadButton() {
        const tosLink = [...document.querySelectorAll('#subnavbar a')]
            .find((link) => link.textContent.trim() === 'TOS');

        if (!tosLink || document.querySelector('#mass-download-button')) {
            return;
        }

        const item = document.createElement('li');
        const button = document.createElement('a');

        button.id = 'mass-download-button';
        button.href = '#';
        button.setAttribute('role', 'button');
        button.textContent = 'Mass Download';
        button.addEventListener('click', async (event) => {
            event.preventDefault();

            if (!window.confirm('Download every post image, starting from the first page?')) {
                return;
            }

            requestCount = 0;
            const requestUrl = new URL(window.location.href);
            let pid = 0;

            try {
                while (true) {
                    requestUrl.searchParams.set('pid', String(pid));
                    const html = await pacedRequest(requestUrl.href);
                    const page = new DOMParser().parseFromString(html, 'text/html');

                    const imageList = page.querySelector('.image-list');
                    const links = imageList ? [...imageList.querySelectorAll('a[href]')] : [];

                    if (!imageList || links.length === 0) {
                        console.log(`Finished: no post links found at pid=${pid}.`);
                        return;
                    }

                    for (const link of links) {
                        const postUrl = new URL(link.getAttribute('href'), requestUrl.href).href;
                        const postHtml = await pacedRequest(postUrl);
                        const postPage = new DOMParser().parseFromString(postHtml, 'text/html');

                        const image = postPage.querySelector('#image[alt][src]');

                        if (!image) {
                            console.warn(`Stopped at ${postUrl}: no downloadable image with alt text was found.`);
                            return;
                        }

                        const imageUrl = new URL(image.getAttribute('src'), postUrl).href;
                        const imageBlob = await pacedRequest(imageUrl, 'blob');
                        downloadBlob(imageBlob, filenameFromAlt(image.alt, imageUrl));
                        console.log(`Downloaded: ${postUrl}`);
                    }

                    pid += 42;
                }
            } catch (error) {
                console.error('Mass Download stopped:', error);
            }
        });

        item.appendChild(button);
        tosLink.closest('li').insertAdjacentElement('afterend', item);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addMassDownloadButton, { once: true });
    } else {
        addMassDownloadButton();
    }
})();
