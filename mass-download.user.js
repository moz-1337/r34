// ==UserScript==
// @name         Rule34 Mass Download Button
// @namespace    https://rule34.xxx/
// @version      2.4.0
// @description  Downloads every post image or video into a tags-named folder.
// @match        https://rule34.xxx/*
// @match        https://www.rule34.xxx/*
// @updateURL    https://raw.githubusercontent.com/moz-1337/r34/main/mass-download.user.js
// @downloadURL  https://raw.githubusercontent.com/moz-1337/r34/main/mass-download.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      rule34.xxx
// @connect      www.rule34.xxx
// @connect      wimg.rule34.xxx
// @connect      ahrimp4.rule34.xxx
// ==/UserScript==

(function () {
    'use strict';

    const requestDelay = 2500;
    let requestCount = 0;

    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function request(url, responseType = 'text') {
        if (responseType === 'text' && new URL(url).origin === window.location.origin) {
            return fetch(url, {
                credentials: 'include',
                cache: 'no-store'
            }).then(async (response) => {
                if (!response.ok) {
                    const error = new Error(`Request failed with status ${response.status}`);
                    error.status = response.status;
                    throw error;
                }

                return response.text();
            });
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(responseType === 'blob' ? response.response : response.responseText);
                    } else {
                        const error = new Error(`Request failed with status ${response.status}`);
                        error.status = response.status;
                        reject(error);
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

    async function requestWithRetry(url, responseType = 'text') {
        let retryDelay = 1000;

        while (true) {
            try {
                return await pacedRequest(url, responseType);
            } catch (error) {
                if (error.status !== 429) {
                    throw error;
                }

                console.warn(`Received HTTP 429. Retrying in ${retryDelay / 1000} second(s): ${url}`);
                await wait(retryDelay);
                retryDelay += 1000;
            }
        }
    }

    function filenameFromTags(tags, mediaUrl) {
        const normalizedTags = folderNameFromTags(tags).slice(0, 120);
        const extension = new URL(mediaUrl).pathname.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg';
        return `${normalizedTags}${extension}`;
    }

    function folderNameFromTags(tags) {
        const normalizedTags = tags.trim().replace(/\s+/g, ' ');
        return normalizedTags.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'rule34-media';
    }

    function downloadMedia(mediaUrl, folderName, filename) {
        try {
            GM_download({
                url: mediaUrl,
                name: `${folderName}/${filename}`,
                saveAs: false,
                onload: () => console.log(`Download finished: ${filename}`),
                onerror: (error) => console.error(`Could not download ${mediaUrl}: ${error.error}`),
                onabort: () => console.warn(`Download aborted: ${mediaUrl}`)
            });
        } catch (error) {
            console.error(`Could not start download ${mediaUrl}:`, error);
        }
    }

    function progressKey(requestUrl) {
        const tags = requestUrl.searchParams.get('tags') || 'rule34-media';
        return `mass-download:${requestUrl.origin}${requestUrl.pathname}:${tags}`;
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
            const downloadFolder = folderNameFromTags(requestUrl.searchParams.get('tags') || 'rule34-media');
            const storageKey = progressKey(requestUrl);
            const savedProgress = GM_getValue(storageKey, null);
            let progress = savedProgress || { pid: 0, linkIndex: 0 };

            if (savedProgress) {
                const shouldContinue = window.confirm(
                    `You have an unfinished mass download for tags "${requestUrl.searchParams.get('tags') || 'rule34-media'}".\n\n` +
                    `Continue from pid=${savedProgress.pid}, post ${savedProgress.linkIndex + 1}?\n\n` +
                    'Choose OK to continue or Cancel to delete it and start over later.'
                );

                if (!shouldContinue) {
                    GM_deleteValue(storageKey);
                    console.log('Cancelled and deleted the unfinished mass download.');
                    return;
                }
            }

            try {
                while (true) {
                    const pid = progress.pid;
                    requestUrl.searchParams.set('pid', String(pid));
                    GM_setValue(storageKey, progress);
                    const html = await requestWithRetry(requestUrl.href);
                    const page = new DOMParser().parseFromString(html, 'text/html');

                    const imageList = page.querySelector('.image-list');
                    const links = imageList ? [...imageList.querySelectorAll('a[href]')] : [];

                    if (!imageList || links.length === 0) {
                        console.log(`Finished: no post links found at pid=${pid}.`);
                        GM_deleteValue(storageKey);
                        return;
                    }

                    const firstLinkIndex = pid === progress.pid ? progress.linkIndex : 0;
                    for (let linkIndex = firstLinkIndex; linkIndex < links.length; linkIndex += 1) {
                        const link = links[linkIndex];
                        const postUrl = new URL(link.getAttribute('href'), requestUrl.href).href;
                        const postHtml = await requestWithRetry(postUrl);
                        const postPage = new DOMParser().parseFromString(postHtml, 'text/html');

                        const image = postPage.querySelector('#image[alt][src]');
                        const video = postPage.querySelector('video source[src]');

                        if (!image && !video) {
                            console.warn(`Stopped at ${postUrl}: no downloadable image or video was found.`);
                            return;
                        }

                        const mediaUrl = new URL(
                            image ? image.getAttribute('src') : video.getAttribute('src'),
                            postUrl
                        ).href;
                        const tags = image
                            ? image.alt
                            : postPage.querySelector('#tags')?.value || postPage.querySelector('#tags')?.textContent || '';

                        if (!tags.trim()) {
                            console.warn(`Stopped at ${postUrl}: no tags were found for the filename.`);
                            return;
                        }

                        const filename = filenameFromTags(tags, mediaUrl);
                        downloadMedia(mediaUrl, downloadFolder, filename);
                        progress = {
                            pid,
                            linkIndex: linkIndex + 1
                        };
                        GM_setValue(storageKey, progress);
                        console.log(`Downloaded: ${postUrl}`);
                    }

                    progress = {
                        pid: pid + 42,
                        linkIndex: 0
                    };
                    GM_setValue(storageKey, progress);
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
