import express, { Request, Response } from 'express';

const router = express.Router();

router.get("/pubkey", async (req: Request, res: Response) => {
    try {
        console.log('Received request for public key');
        res.status(200).send(process.env.sign_public_key)
    } catch (error) {
        res.status(500).send((error as Error).message);
    }
});

module.exports = router;