const CINEMA_EVENT_DESCRIPTION_TAG = "Created by Google Calendar Cinema Event Manager";
const CINEWORLD = "Cineworld";
const PICTUREHOUSE = "Picturehouse";
const ADVERT_LENGTH_IN_MINUTES = 25;
const DEFAULT_RUNTIME = 120;
const TMDB_ACESS_TOKEN = PropertiesService.getScriptProperties().getProperty('TMDB_ACCESS_TOKEN');
const TMDB_LANGUAGE = 'en-GB';
const GMAIL_INBOX_PREFIX = "https://mail.google.com/mail/u/0/#inbox/"

class CancelledCinemaEvent {
    public readonly cinemaChain: string;
    public readonly film: string;
    public readonly start: Date;
    public readonly end: Date;
    public readonly location: string;

    constructor(cinemaChain: string, film: string, start: Date, end: Date, location: string) {
        this.cinemaChain = cinemaChain;
        this.film = film;
        this.start = start;
        this.end = end;
        this.location = location;
    }
}

class CinemaEvent {
    public readonly cinemaChain: string;
    public readonly title: string;
    public readonly film: string;
    public readonly start: Date;
    public readonly end: Date;
    public readonly location: string;
    public readonly numberOfAttendees: number;
    public readonly seats: string;
    public readonly rating: string;
    public readonly description: string;
    public readonly bookingReference: string;
    public readonly mailLink: string;

    constructor(cinemaChain: string, title: string, film: string, start: Date, runtime: number | null, location: string, numberOfAttendees: number, seats: string, rating: string, bookingReference: string, mailLink: string) {
        this.cinemaChain = cinemaChain.trim();
        this.title = title.trim();
        this.film = film.trim();
        this.start = start;
        this.location = location.trim();
        this.numberOfAttendees = numberOfAttendees;
        this.seats = seats.trim();
        this.rating = rating.trim();
        this.bookingReference = bookingReference.trim();
        this.mailLink = mailLink;
        let _runtime = DEFAULT_RUNTIME;
        if (runtime !== null) {
            _runtime = runtime;
        } else {
            const tmdbRuntime = CinemaEvent.getTmdbRuntime(this.film);
            if (tmdbRuntime !== null) {
                _runtime = tmdbRuntime;
            }
        }

        this.end = new Date(start.getTime() + (_runtime + ADVERT_LENGTH_IN_MINUTES) * 60000);

        const geocoder = Maps.newGeocoder().geocode(location);
        if (geocoder.results.length != 0) {
            this.location = geocoder.results[0].formatted_address;
        } else {
            this.location = location;
        }

        this.description =
        `
Booking reference: ${this.bookingReference}
Number of attendees: ${this.numberOfAttendees}
Seats: ${this.seats}
Rating: ${this.rating}

<a href="${mailLink}">Generated from this email</a>

${CINEMA_EVENT_DESCRIPTION_TAG}
`;
    }

    static getTmdbRuntime(search: string): number | null {
        let tmdb_search_term = search.toLowerCase();

        if (tmdb_search_term.endsWith("original cut")) {
            const lastIndex = tmdb_search_term.lastIndexOf("original cut");
            tmdb_search_term = tmdb_search_term.slice(0, lastIndex).trim();
        }

        if (tmdb_search_term.endsWith("-")) {
            const lastIndex = tmdb_search_term.lastIndexOf('-');
            tmdb_search_term = tmdb_search_term.slice(0, lastIndex).trim();
        }

        if (tmdb_search_term.includes("(35mm)")) {
            tmdb_search_term = tmdb_search_term.replace("(35mm)", "").trim();
        }

        if (tmdb_search_term.endsWith("+ panel")) {
            const lastIndex = tmdb_search_term.lastIndexOf("+ panel");
            tmdb_search_term = tmdb_search_term.slice(0, lastIndex).trim();
        }

        if (tmdb_search_term.endsWith("+ recorded q&a")) {
            const lastIndex = tmdb_search_term.lastIndexOf("+ recorded q&a");
            tmdb_search_term = tmdb_search_term.slice(0, lastIndex).trim();
        }

        if (tmdb_search_term.endsWith("+ q&a")) {
            const lastIndex = tmdb_search_term.lastIndexOf("+ q&a");
            tmdb_search_term = tmdb_search_term.slice(0, lastIndex).trim();
        }

        if (tmdb_search_term.startsWith("sla:")) {
            const firstIndex = tmdb_search_term.indexOf("sla:");
            tmdb_search_term = tmdb_search_term.slice(firstIndex + "sla:".length, tmdb_search_term.length).trim();
        }

        if (tmdb_search_term.startsWith("dementia friendly:")) {
            const firstIndex = tmdb_search_term.indexOf("dementia friendly:");
            tmdb_search_term = tmdb_search_term.slice(firstIndex + "dementia friendly:".length, tmdb_search_term.length).trim();
        }

        Logger.log(`Searching TMDB with term '${tmdb_search_term}'`);
        const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tmdb_search_term)}-&include_adult=true&language=${TMDB_LANGUAGE}&page=1`;

        const options = {
            'muteHttpExceptions': true,
            'headers' : {
                'Authorization': `Bearer ${TMDB_ACESS_TOKEN}`,
                'accept': 'application/json'
            }
        };

        const searchResponse = UrlFetchApp.fetch(searchUrl, options);
        const parsedSearchResponse = JSON.parse(searchResponse.getContentText());
        if (parsedSearchResponse.results.length > 0) {
            const firstResult = parsedSearchResponse.results[0];
            const tmdb_id: string = firstResult.id;
            const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${tmdb_id}?language=${TMDB_LANGUAGE}`;

            const movieDetailsResponse = UrlFetchApp.fetch(movieDetailsUrl, options);
            const parsedMovieDetailsResponse = JSON.parse(movieDetailsResponse.getContentText());
            const runtimeInMinutes: number = parsedMovieDetailsResponse.runtime;
            if (runtimeInMinutes > 0) {
                return runtimeInMinutes;
            }
        }
        return null;
    }
}

class CinemaMailThreadSearch {
    public readonly cinemaChain: string;
    public readonly eventSearchCriteriaString: string;
    public readonly eventMessageParser: ((message: GoogleAppsScript.Gmail.GmailMessage) => CinemaEvent | null);
    public readonly cancellationSearchCriteriaString: string | null = null;
    public readonly cancellationMessageParser: ((message: GoogleAppsScript.Gmail.GmailMessage) => CancelledCinemaEvent | null) | null = null;

    constructor(cinemaChain: string, eventSearchCriteria: GMailSearchCriteria[], eventMessageParser: ((message: GoogleAppsScript.Gmail.GmailMessage) => CinemaEvent | null), cancellationSearchCriteria: GMailSearchCriteria[] | null, cancellationMessageParser: ((message: GoogleAppsScript.Gmail.GmailMessage) => CancelledCinemaEvent | null) | null) {
        this.cinemaChain = cinemaChain;
        this.eventSearchCriteriaString = eventSearchCriteria.map(condition => {
            return `${condition.operator}:${condition.value}`
          }).join(' ');
        this.eventMessageParser = eventMessageParser;

        if (cancellationSearchCriteria != null && cancellationSearchCriteria != undefined) {
            this.cancellationSearchCriteriaString = cancellationSearchCriteria.map(condition => {
                return `${condition.operator}:${condition.value}`
              }).join(' ');
        }
        this.cancellationMessageParser = cancellationMessageParser;
    }
}

class GMailSearchCriteria {
    public readonly operator: string;
    public readonly value: string;
    
    constructor(operator: string, value: string) {
        this.operator = operator;
        this.value = value;
    }
}

function parseCineworldEventEmail(mail: GoogleAppsScript.Gmail.GmailMessage): CinemaEvent| null {
    const bookingDetailsBodyRegex = new RegExp(/You are going to see: .*(?=Use your e-ticket)/gms);
    const bookingReferenceRegex = new RegExp(/(?<=Your booking reference\snumber\sis:\s)[a-zA-Z0-9]*/mg);
    const filmNameRegex = new RegExp(/(?<=You are going to see:\s\*).*(?=\*)/);
    const cinemaAddressRegex = new RegExp(/(?<=Cinema addres: \*).*(?=\*)/);
    const dateRegex = new RegExp(/(?<=Date: \*).*(?=\*)/);
    const ticketCountRegex  = new RegExp(/(?<=Number of people going: \*).*(?=\*)/);
    const screenRegex = new RegExp(/(?<=Screen: \*).*(?=\*)/);
    const seatsRegex = new RegExp(/(?<=Seat\(s\): \*).*(?=\*)/);
    const certificationRegex = new RegExp(/(?<=Certification: \*).*(?=\*)/);
    const runningTimeInMinutesRegex = new RegExp(/(?<=Running time: \*).*(?= minutes\*)/);

    const mailPlainBody = mail.getPlainBody();

    const mailLink = `${GMAIL_INBOX_PREFIX}/${mail.getId()}`;

    const bookingReference = getFirstEventDetailMatch(bookingReferenceRegex, mailPlainBody, "booking reference", "mail body");
    if (bookingReference === null) {
        return null;
    }
    
    const bookingDetailsBody = getFirstEventDetailMatch(bookingDetailsBodyRegex, mailPlainBody, "booking details", "mail body");
    if (bookingDetailsBody === null) {
        return null;
    }

    const filmName = getFirstEventDetailMatch(filmNameRegex, bookingDetailsBody, "film name", "booking details");
    if (filmName === null) {
        return null;
    }

    const cinemaAddress = getFirstEventDetailMatch(cinemaAddressRegex, bookingDetailsBody, "cinema address", "booking details");
    if (cinemaAddress === null) {
        return null;
    }

    const dateString = getFirstEventDetailMatch(dateRegex, bookingDetailsBody, "date", "booking details");
    if (dateString === null) {
        return null;
    }

    const ticketCountString = getFirstEventDetailMatch(ticketCountRegex, bookingDetailsBody, "ticket count", "booking details");
    if (ticketCountString === null) {
        return null;
    }

    const ticketCount = Number.parseInt(ticketCountString);

    const screenString = getFirstEventDetailMatch(screenRegex, bookingDetailsBody, "screen", "booking details");
    if (screenString === null) {
        return null;
    }

    const seatsString = getFirstEventDetailMatch(seatsRegex, bookingDetailsBody, "seats", "booking details");
    if (seatsString === null) {
        return null;
    }

    const certificationString = getFirstEventDetailMatch(certificationRegex, bookingDetailsBody, "certification", "booking details");
    if (certificationString === null) {
        return null;
    }

    const runningTimeInMinutesString = getFirstEventDetailMatch(runningTimeInMinutesRegex, bookingDetailsBody, "running time in minutes", "booking details");
    if (runningTimeInMinutesString === null) {
        return null;
    }

    const runningTimeInMinutes = Number.parseInt(runningTimeInMinutesString);

    const dateTimeSplit = dateString.split(' ')
    const date = dateTimeSplit[0]
    const time = dateTimeSplit[1];
    const dateSplit = date.split('/')
    const day = dateSplit[0]
    const month = dateSplit[1]
    const year = dateSplit[2]
    const cinemaChain = CINEWORLD;
    const title = filmName;
    const film = filmName;
    const start = new Date(`${year}-${month}-${day}T${time}:00`);
    const location = `${cinemaChain}, ${cinemaAddress}`;
    const numberOfAttendees = ticketCount;
    const seats = seatsString;
    const rating = certificationString;
    return new CinemaEvent(cinemaChain, title, film, start, runningTimeInMinutes, location, numberOfAttendees, seats, rating, bookingReference, mailLink);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseCineworldCancellationEmail(mail: GoogleAppsScript.Gmail.GmailMessage): CancelledCinemaEvent {
    const cinemaChain = "";
    const film = "";
    const start = new Date();
    const end = new Date();
    const location = "";
    return new CancelledCinemaEvent(cinemaChain, film, start, end, location);
}

function getFirstMatch(regex: RegExp, subject: string): string | null {
    const matchesResult = subject.match(regex);
    if (matchesResult === null) {
        return null;
    }
    const matches = matchesResult;
    if (matches.length > 1) {
        throw new Error("Found more than one match.");
    }
    return matches[0];
}

function getFirstEventDetailMatch(regex: RegExp, subject: string, lookingFor: string, subjectName: string): string | null {
    try {
        return getFirstMatch(regex, subject);
    } catch (error) {
        throw new Error(`Error occurred while attempting to find ${lookingFor} in ${subjectName}: ${error}`);
    }
}

function parsePicturehouseEventEmail(mail: GoogleAppsScript.Gmail.GmailMessage): CinemaEvent | null {
    const bookingDetailsBodyRegex = new RegExp(/(?<=Your Order).*(?=About your order)/gms);
    const bookingReferenceRegex = new RegExp(/(?<=\*)[a-zA-Z0-9]*(?=\*)/);
    const filmNameRegex = new RegExp(/(?<=Film\/Event:).*/);
    const cinemaRegex = new RegExp(/(?<=Cinema:).*/);
    const dateRegex = new RegExp(/(?<=Date:).*/);
    const timeRegex = new RegExp(/(?<=Time:).*/);
    const screenRegex = new RegExp(/(?<=Screen:).*/);
    const seatsRegex = new RegExp(/(?<=[Tickets:.*| Member])[A-Z]+-[0-9]*/gm);

    const mailLink = `${GMAIL_INBOX_PREFIX}/${mail.getId()}`;

    const mailPlainBody = mail.getPlainBody();

    const bookingReference = getFirstEventDetailMatch(bookingReferenceRegex, mailPlainBody, "booking reference", "mail body");
    if (bookingReference === null) {
        return null;
    }
    
    const bookingDetailsBody = getFirstEventDetailMatch(bookingDetailsBodyRegex, mailPlainBody, "booking details", "mail body");
    if (bookingDetailsBody === null) {
        return null;
    }

    const filmName = getFirstEventDetailMatch(filmNameRegex, bookingDetailsBody, "film name", "booking details");
    if (filmName === null) {
        return null;
    }

    const cinemaName = getFirstEventDetailMatch(cinemaRegex, bookingDetailsBody, "cinema name", "booking details");
    if (cinemaName === null) {
        return null;
    }

    const dateString = getFirstEventDetailMatch(dateRegex, bookingDetailsBody, "date", "booking details");
    if (dateString === null) {
        return null;
    }

    const timeString = getFirstEventDetailMatch(timeRegex, bookingDetailsBody, "time", "booking details");
    if (timeString === null) {
        return null;
    }

    const screenString = getFirstEventDetailMatch(screenRegex, bookingDetailsBody, "screen", "booking details");
    if (screenString === null) {
        return null;
    }

    const seatsMatchesResult = bookingDetailsBody.match(seatsRegex);
    if (seatsMatchesResult === null) {
        return null;
    }
    const seatsMatches = seatsMatchesResult;

    const cinemaChain = PICTUREHOUSE;
    const cinema = cinemaName;
    const film = filmName;
    const start = new Date(`${dateString.trim()} ${timeString.trim()}`);
    const location = `${cinemaChain.trim()}, ${cinema.trim()}`;
    const numberOfAttendees = seatsMatches.length;
    const seats = seatsMatches.join(', ');
    const rating = "Unknown";
    const title = filmName;
    return new CinemaEvent(cinemaChain, title, film, start, null, location, numberOfAttendees, seats, rating, bookingReference, mailLink);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parsePicturehouseCancellationEmail(mail: GoogleAppsScript.Gmail.GmailMessage): CancelledCinemaEvent {
    const cinemaChain = "";
    const film = "";
    const start = new Date();
    const end = new Date();
    const location = "";
    return new CancelledCinemaEvent(cinemaChain, film, start, end, location);
}

const mailThreadSearchCriteriaByCinemaChains = [
    new CinemaMailThreadSearch(CINEWORLD, [
        new GMailSearchCriteria("from", "tickets@cineworldtickets.com"),
        new GMailSearchCriteria("subject", "cineworld"),
        new GMailSearchCriteria("subject", '"tickets for"'),
    ], parseCineworldEventEmail,
    null,
    parseCineworldCancellationEmail),
    new CinemaMailThreadSearch(PICTUREHOUSE, [
        new GMailSearchCriteria("from", "no-reply@picturehouses.com"),
        new GMailSearchCriteria("subject", '"Booking Confirmation for"'),
    ], parsePicturehouseEventEmail,
    null,
    parsePicturehouseCancellationEmail)
]

const CALENDAR_URI = "vk7juf2o9nbpchm4sqnofvlid8@group.calendar.google.com";
const CALENDAR: GoogleAppsScript.Calendar.Calendar = CalendarApp.getCalendarById(CALENDAR_URI);


function getEventsByCinemaChain(): Map<string, CinemaEvent[]> {
    const eventsByCinemaChain: Map<string, CinemaEvent[]> = new Map<string, CinemaEvent[]>();
    mailThreadSearchCriteriaByCinemaChains.forEach(cinemaMailThreadSearch => {
        const mailThreads = GmailApp.search(cinemaMailThreadSearch.eventSearchCriteriaString);
        mailThreads.forEach(mailThread => {
            const messages = mailThread.getMessages().sort((a, b) => (a.getDate() > b.getDate()) ? 1 : -1);
            messages.forEach(message => {
                const cinemaEvent = cinemaMailThreadSearch.eventMessageParser(message);
                if (cinemaEvent !== null) {
                    const cinemaEvents = eventsByCinemaChain.get(cinemaMailThreadSearch.cinemaChain);
                    if (cinemaEvents != null && cinemaEvents != undefined) {
                        cinemaEvents.push(cinemaEvent);
                        eventsByCinemaChain.set(cinemaMailThreadSearch.cinemaChain, cinemaEvents);
                    } else {
                        eventsByCinemaChain.set(cinemaMailThreadSearch.cinemaChain, [cinemaEvent]);
                    }
                }
            })
        });
    });
    return eventsByCinemaChain;
}

function getCancelledEventsByCinemaChain(): Map<string,CancelledCinemaEvent[]> {
    const cancelledEventsByChain: Map<string, CancelledCinemaEvent[]> = new Map<string, CancelledCinemaEvent[]>(); 
    mailThreadSearchCriteriaByCinemaChains.forEach(cinemaMailThreadSearch => {
        const cancellations: CancelledCinemaEvent[] = []; 
        if (cinemaMailThreadSearch.cancellationSearchCriteriaString !== null && cinemaMailThreadSearch.cancellationMessageParser !== null) {
            const cancellationMessageParser = cinemaMailThreadSearch.cancellationMessageParser;
            const mailThreads = GmailApp.search(cinemaMailThreadSearch.cancellationSearchCriteriaString);
            mailThreads.forEach(mailThread => {
                const messages = mailThread.getMessages().sort((a, b) => (a.getDate() > b.getDate()) ? 1 : -1);
                messages.forEach(message => {
                    const cancellation = cancellationMessageParser(message);
                    if (cancellation !== null) {
                        cancellations.push(cancellation);
                    }
                });
            });
        }
        cancelledEventsByChain.set(cinemaMailThreadSearch.cinemaChain, cancellations);
    });
    return cancelledEventsByChain;
}

function getExistingCalendarEvents(calendar: GoogleAppsScript.Calendar.Calendar, event: CinemaEvent): GoogleAppsScript.Calendar.CalendarEvent[] {
    const eventsCreatedByThisAppWithMatchingTimes = calendar.getEvents(event.start, event.end, { search: CINEMA_EVENT_DESCRIPTION_TAG });
    return eventsCreatedByThisAppWithMatchingTimes.filter(existingEvent => existingEvent.getTitle() == event.title && existingEvent.getLocation() == event.location);
}

function matchEventsToCancellations(cinemaEvents: Map<string, CinemaEvent[]>, cancellations: Map<string, CancelledCinemaEvent[]>): Map<string, Map<CinemaEvent, CancelledCinemaEvent | null>> {
    const cancellationsByEventByCinemaChain: Map<string, Map<CinemaEvent, CancelledCinemaEvent | null>> = new Map<string, Map<CinemaEvent, CancelledCinemaEvent | null>>();
    cinemaEvents.forEach((events, cinemaChain) => {
        const cancellationEventsForCinemaChainResult = cancellations.get(cinemaChain);

        const cancellationsByEventFromCinemaChain: Map<CinemaEvent, CancelledCinemaEvent | null> = new Map<CinemaEvent, CancelledCinemaEvent | null>();

        if (cancellationEventsForCinemaChainResult !== undefined) {
            const cancellationEventsForCinemaChain = cancellationEventsForCinemaChainResult;
            events.forEach((event) => {
                const matchingCancellation = cancellationEventsForCinemaChain.find(cancellation => {
                    return cancellation.film == event.film && cancellation.start == event.start && cancellation.end == event.end && cancellation.location == event.location;
                });

                if (matchingCancellation == null) {
                    cancellationsByEventFromCinemaChain.set(event, null);
                } else {
                    cancellationsByEventFromCinemaChain.set(event, matchingCancellation);
                }
            });
        }

        cancellationsByEventByCinemaChain.set(cinemaChain, cancellationsByEventFromCinemaChain);
    });
    return cancellationsByEventByCinemaChain;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main() {
    const cinemaEventsByCinemaChain = getEventsByCinemaChain(); // get events that would be created
    Logger.log(`Found events for ${cinemaEventsByCinemaChain.size} cinema chains.`);
    const cancellationsByCinemaChain = getCancelledEventsByCinemaChain(); // get all cancellation events
    Logger.log(`Found cancellations for ${cancellationsByCinemaChain.size} cinema chains.`);
    const cancellationsByEventByCinemaChain = matchEventsToCancellations(cinemaEventsByCinemaChain, cancellationsByCinemaChain); // match the events to the cancellations
    Logger.log("Matched events to cancellations.");
    cancellationsByEventByCinemaChain.forEach((cancellationsByEvent, cinemaChain) => { // for each event and cancellations key pair
        Logger.log(`Processing events for ${cinemaChain}...`);
        cancellationsByEvent.forEach((cancellation, event) => { // for each event and cancellation key pair
            
            if (cancellation !== null) { // if the current event has a cancellation
                Logger.log(`Processing event ${event.title} for ${cinemaChain} with cancellation...`);
            } else {
                Logger.log(`Processing event ${event.title} for ${cinemaChain} with no cancellation...`);
            }

            const matchingCalendarEvents = getExistingCalendarEvents(CALENDAR, event); // get any existing calendar events for that event

            Logger.log(`Found ${matchingCalendarEvents.length} existing events for ${event.title}.`)
            matchingCalendarEvents.forEach((matchingCalendarEvent, index) => { // for each existing calendar event
                if (index === 0) { // if this is the first event
                    Logger.log(`Updating event "${matchingCalendarEvent.getTitle()}" (${matchingCalendarEvent.getId()}) with details for "${event.film}".`)
                    matchingCalendarEvent.setTitle(event.title);
                    matchingCalendarEvent.setTime(event.start, event.end);
                    matchingCalendarEvent.setDescription(event.description);
                    matchingCalendarEvent.setLocation(event.location);
                    return; // skip to the next one
                }
                Logger.log(`Preparing to delete event "${matchingCalendarEvent.getId()}".`);
                matchingCalendarEvent.deleteEvent(); // delete the existing calendar event
                Logger.log(`Deleted event "${matchingCalendarEvent.getTitle()}" (${matchingCalendarEvent.getId()}).`);
            });

            if (cancellation !== null) { // if the current event does not has a cancellation and no matching calendar events were found
                Logger.log(`Not creating new event ${event.title} as there is a cancellation.`)
                return;
            }

            if (matchingCalendarEvents.length > 0) { // if the current event does not has a cancellation and no matching calendar events were found
                Logger.log(`Not creating new event ${event.title} as existing event was updated.`)
                return;
            }

            Logger.log(`Creating event with title ${event.title}, starting at ${event.start}, ending at ${event.end}, at ${event.location}, with seats ${event.seats}`);
            CALENDAR.createEvent(event.title, event.start, event.end, { description: event.description, location: event.location }); // create the calendar event
        });
    });
}

