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

    constructor(cinemaChain: string, title: string, film: string, start: Date, end: Date, location: string, numberOfAttendees: number, seats: string, rating: string, bookingReference: string) {
        this.cinemaChain = cinemaChain.trim();
        this.title = title.trim();
        this.film = film.trim();
        this.start = start;
        this.end = end;
        this.location = location.trim();
        this.numberOfAttendees = numberOfAttendees;
        this.seats = seats.trim();
        this.rating = rating.trim();
        this.description = "";
        this.bookingReference = bookingReference.trim();

        let geocoder = Maps.newGeocoder().geocode(location);
        if (geocoder.results.length != 0) {
            this.location = geocoder.results[0].formatted_address;
        } else {
            this.location = location;
        }
    }
}

class CinemaMailThreadSearch {
    public readonly cinemaChain: string;
    public readonly eventSearchCriteriaString: string;
    public readonly eventMessageParser: ((message: string) => CinemaEvent | null);
    public readonly cancellationSearchCriteriaString: string | null = null;
    public readonly cancellationMessageParser: ((message: string) => CancelledCinemaEvent | null) | null = null;

    constructor(cinemaChain: string, eventSearchCriteria: GMailSearchCriteria[], eventMessageParser: ((message: string) => CinemaEvent | null), cancellationSearchCriteria: GMailSearchCriteria[] | null, cancellationMessageParser: ((message: string) => CancelledCinemaEvent | null) | null) {
        this.cinemaChain = cinemaChain;
        Logger.log(`Creating CinemaMailThreadSearch for ${cinemaChain}`);
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

function parseCineworldEventEmail(mail: string): CinemaEvent| null {
    Logger.log(mail);
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

    let bookingReference = getFirstEventDetailMatch(bookingReferenceRegex, mail, "booking reference", "mail body");
    if (bookingReference === null) {
        return null;
    }
    
    let bookingDetailsBody = getFirstEventDetailMatch(bookingDetailsBodyRegex, mail, "booking details", "mail body");
    if (bookingDetailsBody === null) {
        return null;
    }

    let filmName = getFirstEventDetailMatch(filmNameRegex, bookingDetailsBody, "film name", "booking details");
    if (filmName === null) {
        return null;
    }

    let cinemaAddress = getFirstEventDetailMatch(cinemaAddressRegex, bookingDetailsBody, "cinema address", "booking details");
    if (cinemaAddress === null) {
        return null;
    }

    let dateString = getFirstEventDetailMatch(dateRegex, bookingDetailsBody, "date", "booking details");
    if (dateString === null) {
        return null;
    }

    let ticketCountString = getFirstEventDetailMatch(ticketCountRegex, bookingDetailsBody, "ticket count", "booking details");
    if (ticketCountString === null) {
        return null;
    }

    let ticketCount = Number.parseInt(ticketCountString);

    let screenString = getFirstEventDetailMatch(screenRegex, bookingDetailsBody, "screen", "booking details");
    if (screenString === null) {
        return null;
    }

    let seatsString = getFirstEventDetailMatch(seatsRegex, bookingDetailsBody, "seats", "booking details");
    if (seatsString === null) {
        return null;
    }

    let certificationString = getFirstEventDetailMatch(certificationRegex, bookingDetailsBody, "certification", "booking details");
    if (certificationString === null) {
        return null;
    }

    let runningTimeInMinutesString = getFirstEventDetailMatch(runningTimeInMinutesRegex, bookingDetailsBody, "running time in minutes", "booking details");
    if (runningTimeInMinutesString === null) {
        return null;
    }

    let runningTimeInMinutes = Number.parseInt(runningTimeInMinutesString);

    let dateTimeSplit = dateString.split(' ')
    let date = dateTimeSplit[0]
    let time = dateTimeSplit[1];
    let dateSplit = date.split('/')
    let day = dateSplit[0]
    let month = dateSplit[1]
    let year = dateSplit[2]

    let cinemaChain = "Cineworld";
    let title = filmName;
    let film = filmName;
    let start = new Date(`${year}-${month}-${day}T${time}:00`);
    let end = new Date(start.getTime() + runningTimeInMinutes * 60000);
    let location = `${cinemaChain}, ${cinemaAddress}`;
    let numberOfAttendees = ticketCount;
    let seats = seatsString;
    let rating = certificationString;
    return new CinemaEvent(cinemaChain, title, film, start, end, location, numberOfAttendees, seats, rating, bookingReference);
}

function parseCineworldCancellationEmail(mail: string): CancelledCinemaEvent {
    let cinemaChain = "";
    let film = "";
    let start = new Date();
    let end = new Date();
    let location = "";
    return new CancelledCinemaEvent(cinemaChain, film, start, end, location);
}

function getFirstMatch(regex: RegExp, subject: string): string | null {
    let matchesResult = subject.match(regex);
    if (matchesResult === null) {
        return null;
    }
    let matches = matchesResult;
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

function parsePicturehouseEventEmail(mail: string): CinemaEvent | null {
    Logger.log(mail);
    const bookingDetailsBodyRegex = new RegExp(/(?<=Your Order).*(?=About your order)/gms);
    const bookingReferenceRegex = new RegExp(/\*[a-zA-Z0-9]*\*/);
    const filmNameRegex = new RegExp(/(?<=Film\/Event:).*/);
    const cinemaRegex = new RegExp(/(?<=Cinema:).*/);
    const dateRegex = new RegExp(/(?<=Date:).*/);
    const timeRegex = new RegExp(/(?<=Time:).*/);
    const ticketCountRegex  = new RegExp(/(?<=Tickets:)\s*[0-9]*/);
    const screenRegex = new RegExp(/(?<=Screen:).*/);
    const seatsRegex = new RegExp(/(?<=[Tickets:.*| Member])[A-Z]+-[0-9]*/gm);

    let bookingReference = getFirstEventDetailMatch(bookingReferenceRegex, mail, "booking reference", "mail body");
    if (bookingReference === null) {
        return null;
    }
    
    let bookingDetailsBody = getFirstEventDetailMatch(bookingDetailsBodyRegex, mail, "booking details", "mail body");
    if (bookingDetailsBody === null) {
        return null;
    }

    let filmName = getFirstEventDetailMatch(filmNameRegex, bookingDetailsBody, "film name", "booking details");
    if (filmName === null) {
        return null;
    }

    let cinemaName = getFirstEventDetailMatch(cinemaRegex, bookingDetailsBody, "cinema name", "booking details");
    if (cinemaName === null) {
        return null;
    }

    let dateString = getFirstEventDetailMatch(dateRegex, bookingDetailsBody, "date", "booking details");
    if (dateString === null) {
        return null;
    }

    let timeString = getFirstEventDetailMatch(timeRegex, bookingDetailsBody, "time", "booking details");
    if (timeString === null) {
        return null;
    }

    let ticketCountString = getFirstEventDetailMatch(ticketCountRegex, bookingDetailsBody, "ticket count", "booking details");
    if (ticketCountString === null) {
        return null;
    }

    let ticketCount = Number.parseInt(ticketCountString);

    let screenString = getFirstEventDetailMatch(screenRegex, bookingDetailsBody, "screen", "booking details");
    if (screenString === null) {
        return null;
    }

    let seatsMatchesResult = bookingDetailsBody.match(seatsRegex);
    if (seatsMatchesResult === null) {
        return null;
    }
    let seatsMatches = seatsMatchesResult;

    let cinemaChain = "Picturehouse";
    let cinema = cinemaName;
    let film = filmName;
    let start = new Date(`${dateString.trim()} ${timeString.trim()}`);
    let end = new Date(start.getTime() + 90 * 60000);
    let location = `${cinemaChain.trim()}, ${cinema.trim()}`;
    let numberOfAttendees = ticketCount;
    let seats = seatsMatches.join(', ');
    let rating = "Unknown";
    let title = filmName;
    return new CinemaEvent(cinemaChain, title, film, start, end, location, numberOfAttendees, seats, rating, bookingReference);
}

function parsePicturehouseCancellationEmail(mail: string): CancelledCinemaEvent {
    Logger.log(mail);
    let cinemaChain = "";
    let film = "";
    let start = new Date();
    let end = new Date();
    let location = "";
    return new CancelledCinemaEvent(cinemaChain, film, start, end, location);
}

const mailThreadSearchCriteriaByCinemaChains = [
    new CinemaMailThreadSearch("cineworld", [
        new GMailSearchCriteria("from", "tickets@cineworldtickets.com"),
        new GMailSearchCriteria("subject", "cineworld"),
        new GMailSearchCriteria("subject", '"tickets for"'),
    ], parseCineworldEventEmail,
    null,
    parseCineworldCancellationEmail),
    new CinemaMailThreadSearch("picturehouse", [
        new GMailSearchCriteria("from", "no-reply@picturehouses.com"),
        new GMailSearchCriteria("subject", '"Booking Confirmation for"'),
    ], parsePicturehouseEventEmail,
    null,
    parsePicturehouseCancellationEmail)
]

const CALENDAR_URI = "vk7juf2o9nbpchm4sqnofvlid8@group.calendar.google.com";
const CALENDAR: GoogleAppsScript.Calendar.Calendar = CalendarApp.getCalendarById(CALENDAR_URI);


function getEventsByCinemaChain(): Map<string, CinemaEvent[]> {
    let eventsByCinemaChain: Map<string, CinemaEvent[]> = new Map<string, CinemaEvent[]>();
    mailThreadSearchCriteriaByCinemaChains.forEach(cinemaMailThreadSearch => {
        let mailThreads = GmailApp.search(cinemaMailThreadSearch.eventSearchCriteriaString);
        Logger.log(`Found ${mailThreads.length} from cinema chain ${cinemaMailThreadSearch.cinemaChain}`);
        mailThreads.forEach(mailThread => {
            const messages = mailThread.getMessages().sort((a, b) => (a.getDate() > b.getDate()) ? 1 : -1);
            messages.forEach(message => {
                const cinemaEvent = cinemaMailThreadSearch.eventMessageParser(message.getPlainBody());
                if (cinemaEvent !== null) {
                    let cinemaEvents = eventsByCinemaChain.get(cinemaMailThreadSearch.cinemaChain);
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
    let cancelledEventsByChain: Map<string, CancelledCinemaEvent[]> = new Map<string, CancelledCinemaEvent[]>(); 
    mailThreadSearchCriteriaByCinemaChains.forEach(cinemaMailThreadSearch => {
        let cancellations: CancelledCinemaEvent[] = []; 
        if (cinemaMailThreadSearch.cancellationSearchCriteriaString !== null && cinemaMailThreadSearch.cancellationMessageParser !== null) {
            let cancellationMessageParser = cinemaMailThreadSearch.cancellationMessageParser;
            let mailThreads = GmailApp.search(cinemaMailThreadSearch.cancellationSearchCriteriaString);
            mailThreads.forEach(mailThread => {
                const messages = mailThread.getMessages().sort((a, b) => (a.getDate() > b.getDate()) ? 1 : -1);
                messages.forEach(message => {
                    const cancellation = cancellationMessageParser(message.getPlainBody());
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

function doesEventAlreadyExist(calendar: GoogleAppsScript.Calendar.Calendar, event: CinemaEvent): boolean {
    const existingEvents = getExistingCalendarEvents(calendar, event);
    return existingEvents.length > 0;
}

function getExistingCalendarEvents(calendar: GoogleAppsScript.Calendar.Calendar, event: CinemaEvent): GoogleAppsScript.Calendar.CalendarEvent[] {
    return [];
}

function matchEventsToCancellations(cinemaEvents: Map<string, CinemaEvent[]>, cancellations: Map<string, CancelledCinemaEvent[]>): Map<string, Map<CinemaEvent, CancelledCinemaEvent | null>> {
    let cancellationsByEventByCinemaChain: Map<string, Map<CinemaEvent, CancelledCinemaEvent | null>> = new Map<string, Map<CinemaEvent, CancelledCinemaEvent | null>>();
    cinemaEvents.forEach((events, cinemaChain) => {
        let cancellationEventsForCinemaChainResult = cancellations.get(cinemaChain);

        let cancellationsByEventFromCinemaChain: Map<CinemaEvent, CancelledCinemaEvent | null> = new Map<CinemaEvent, CancelledCinemaEvent | null>();

        if (cancellationEventsForCinemaChainResult !== undefined) {
            let cancellationEventsForCinemaChain = cancellationEventsForCinemaChainResult;
            events.forEach((event) => {
                let matchingCancellation = cancellationEventsForCinemaChain.find(cancellation => {
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

function main() {
    let cinemaEventsByCinemaChain = getEventsByCinemaChain(); // get events that would be created
    Logger.log(`Found events for ${cinemaEventsByCinemaChain.size} cinema chains.`);
    let cancellationsByCinemaChain = getCancelledEventsByCinemaChain(); // get all cancellation events
    Logger.log(`Found cancellations for ${cancellationsByCinemaChain.size} cinema chains.`);
    let cancellationsByEventByCinemaChain = matchEventsToCancellations(cinemaEventsByCinemaChain, cancellationsByCinemaChain); // match the events to the cancellations
    Logger.log("Matched events to cancellations.");
    cancellationsByEventByCinemaChain.forEach((cancellationsByEvent, cinemaChain) => { // for each event and cancellations key pair
        cancellationsByEvent.forEach((cancellation, event) => { // for each event and cancellation key pair
            let matchingCalendarEvents = getExistingCalendarEvents(CALENDAR, event); // get any existing calendar events for that event
            matchingCalendarEvents.forEach(matchingCalendarEvent => { // for each existing calendar event
                Logger.log(`Preparing to delete event "${matchingCalendarEvent.getTitle()}".`);
                // matchingCalendarEvent.deleteEvent(); // delete the existing calendar event
                Logger.log(`Deleted event "${matchingCalendarEvent.getTitle()}".`);
            });

            if (cancellation == null) { // if the current event does not has a cancellation
                Logger.log(`Creating event with title ${event.title}, starting at ${event.start}, ending at ${event.end}, at ${event.location}, with seats ${event.seats}`);
                // CALENDAR.createEvent(event.title, event.start, event.end, { description: event.description, location: event.location }); // create the calendar event
            }
        });
    });
}

