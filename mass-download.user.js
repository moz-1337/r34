// ==UserScript==
// @name         Rule34 Mass Download Button
// @namespace    https://rule34.xxx/
// @version      1.2.0
// @description  Adds a Mass Download button that logs post links from the first page.
// @match        https://rule34.xxx/*
// @match        https://www.rule34.xxx/*
// @updateURL    https://raw.githubusercontent.com/moz-1337/r34/main/mass-download.user.js
// @downloadURL  https://raw.githubusercontent.com/moz-1337/r34/main/mass-download.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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

            if (!window.confirm('Fetch the first page and log its post links?')) {
                return;
            }

            const requestUrl = new URL(window.location.href);
            requestUrl.searchParams.set('pid', '0');

            try {
                const response = await fetch(requestUrl.href, {
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error(`Request failed with status ${response.status}`);
                }

                const html = await response.text();
                const page = new DOMParser().parseFromString(html, 'text/html');
                const links = page.querySelectorAll('.image-list a[href]');

                links.forEach((link) => console.log(link.getAttribute('href')));
                console.log(`Logged ${links.length} post link(s) from ${requestUrl.href}`);
            } catch (error) {
                console.error('Mass Download could not read the first page:', error);
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
