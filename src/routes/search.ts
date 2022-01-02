import express, { Request, Response } from 'express';

const utils = require('../utils/util');

const router = express.Router();


router.post("/", async (req: Request, res: Response) => {
    try {
        console.log('Received search');
        console.log(req.body?.context?.transaction_id, req.rawBody);
        var errorMessage = utils.validateInputs(req);
        if (!errorMessage) {
            utils.createOnSearch(req);
            res.status(200).send({
                "message": {
                    "ack": {
                        "status": "ACK"
                    }
                }
            })
        } else {
            res.status(400).send({
                "message": {
                    "ack": {
                        "status": "NACK"
                    }
                },
                "error": {
                    "type": "JSON-SCHEMA-ERROR",
                    "message": errorMessage
                }
            })
        }
    } catch (error) {
        res.status(500).send((error as Error).message);
    }
});


module.exports = router;