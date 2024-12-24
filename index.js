import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import express from 'express';
import pLimit from 'p-limit'; // Install this library using npm install p-limit

// Function to get the total number of pages in the winners section
async function getTotalPages() {
    const url = 'https://www.monopoli.gr/diagonismoi/winners/';
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const paginationLinks = document.querySelectorAll('.nav-links a.page-numbers');
    let maxPage = 1;
    paginationLinks.forEach(link => {
        const pageNum = parseInt(link.textContent);
        if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
        }
    });

    return maxPage;
}

// Function to extract all event links from a page
async function extractEventLinks(pageNumber) {
    const url = `https://www.monopoli.gr/diagonismoi/winners/page/${pageNumber}/`;
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const eventLinks = Array.from(document.querySelectorAll('.winners_contest_box')).map(link => link.href);
    return eventLinks;
}

// Function to extract winners and event title from an event page
async function extractEventDetails(eventUrl) {
    const response = await fetch(eventUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract winners
    const winnersContainer = document.querySelector('.art_article_text.wrapptext p');
    const winnersText = winnersContainer ? winnersContainer.textContent : '';
    const winners = winnersText.split(/<br>|\n/).map(winner => winner.trim()).filter(winner => winner);

    // Extract event title and clean it up
    const titleElement = document.querySelector('.art_info_main_ti');
    let eventTitle = titleElement ? titleElement.textContent : '';
    eventTitle = eventTitle.replace('Νικητές Διαγωνισμού:', '').replace('Νικητες Διαγωνισμου:', '').trim();

    return {
        eventTitle,
        winners
    };
}

// Main function to process all pages and extract data
async function scrapeWinners() {
    const totalPages = await getTotalPages();
    const allEventLinks = [];
    const allEventDetails = [];
    const limit = pLimit(5); // Adjust concurrency level (5 concurrent tasks)

    console.log('Fetching all event links...');
    
    // Fetch all event links concurrently
    const pagePromises = Array.from({ length: totalPages }, (_, i) =>
        limit(() => extractEventLinks(i + 1))
    );
    const eventLinksPerPage = await Promise.all(pagePromises);
    eventLinksPerPage.forEach(links => allEventLinks.push(...links));

    console.log('Total event links fetched:', allEventLinks.length);

    // Fetch all event details concurrently
    const detailPromises = allEventLinks.map(eventUrl =>
        limit(() => extractEventDetails(eventUrl))
    );
    const eventDetails = await Promise.all(detailPromises);

    console.log('Total event details fetched:', eventDetails.length);

    // Combine event URLs with their respective details
    eventDetails.forEach((details, index) => {
        allEventDetails.push({
            eventUrl: allEventLinks[index],
            ...details
        });
    });

    return allEventDetails;
}

// Set up an Express server
const app = express();
const PORT = 3000;

app.get('/winners', async (req, res) => {
    try {
        const winnersData = await scrapeWinners();
        res.json(winnersData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch winners data' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
