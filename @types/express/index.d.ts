declare namespace Express {
    interface Request {
        rawBody: string;
        subscriber_type: string;
        subscriber_url: string;
    }
}