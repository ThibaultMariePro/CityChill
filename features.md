- The cards should have the option to show the location of the activity on google maps. 

- headers of the cards are too simple, too empty, the color gradient is good but it should be more explicit. We should add a better visual cue. Let's write a relevant key word as a card title, like restaurant, bar, cinema, parc... things like this. If too hard to get a key word for certain activities, let's write the category instead.

- Add the possibility to export the agenda. On the Agenda page, add some export options. 

- add a clickable option to reveal a quick description of the event on cards

- add the possibility to switch between the different color themes in the parameters menu

- add the possibility to load the next bunch of results

- if no postal codes or city were specifically pinned in the search bar, replace current results by the new ones from the last query. 

- I'd like a visual indicator of the api connection state, implement a visual cue next to CityChilly logo : 🔴 this if the API is not available, 🟢 this if it's reachable. It implies a heltcheck, or a basic request to open agenda, with the configured api key, it must check if the api key is working, not simply open agenda reachable with a general request.
It'd be interesting if this healtcheck is done every time the user make an action on the main page in the app.

make the app not showing anything about nantes at start, juste a clean screen with no request made.

add a reset button to clear search data, both stored ones, and the last research done by the user

add the today option in the period selection, with the corresponding filter feature

don't load any curated events at start, add an option for the user to load them, but none has to be loaded by default

Google search, triggered with the search button on the cards, has to be done with the location of the activity / event in addition of the title 

Add the possibility to request for a next bunch of results. For now there is a max limit of pulled and shown elements from the api request, but it should be possible to request for more, with a next button for example. 

