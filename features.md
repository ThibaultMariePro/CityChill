- The cards should have the option to show the location of the activity on google maps. 

- headers of the cards are too simple, too empty, the color gradient is good but it should be more explicit. We should add a better visual cue. Let's write a relevant key word as a card title, like restaurant, bar, cinema, parc... things like this. If too hard to get a key word for certain activities, let's write the category instead.

- Add the possibility to export the agenda. On the Agenda page, add some export options. 

- add a clickable option to reveal a quick description of the event on cards

- add the possibility to switch between the different color themes in the parameters menu

- add the possibility to load the next bunch of results

- if no postal codes or city were specifically pinned in the search bar, replace current results by the new ones from the last query. 

- I'd like a visual indicator of the api connection state, implement a visual cue next to CityChilly logo : 🔴 this if the API is not available, 🟢 this if it's reachable. It implies a heltcheck, or a basic request to open agenda, with the configured api key, it must check if the api key is working, not simply open agenda reachable with a general request.
It'd be interesting if this healtcheck is done every time the user make an action on the main page in the app.