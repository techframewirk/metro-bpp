import _sodium, { base64_variants } from 'libsodium-wrappers';
import { Request, Response, NextFunction } from "express";
const axios = require('axios').default;
const { config } = require('../../config/config');
import { Subscribers } from '../db/models/Subscribers.model';

import key from '../../config/key';

export const createKeyPair = async () => {
    await _sodium.ready;
    const sodium = _sodium;
    let { publicKey, privateKey } = sodium.crypto_sign_keypair();
    const publicKey_base64 = sodium.to_base64(publicKey, base64_variants.ORIGINAL);
    const privateKey_base64 = sodium.to_base64(privateKey, base64_variants.ORIGINAL);
    key.set('public_key', publicKey_base64);
    key.set('private_key', privateKey_base64);
    key.save(0);
    console.log("Key pair created");
}

export function combineURLs(baseURL: string, relativeURL: string) {
    return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
}

export const createSigningString = async (message: string, created?: string, expires?: string) => {
    if (!created) created = Math.floor(new Date().getTime() / 1000).toString();
    if (!expires) expires = (parseInt(created) + (1 * 60 * 60)).toString(); //Add required time to create expired
    //const digest = createBlakeHash('blake512').update(JSON.stringify(message)).digest("base64");
    //const digest = blake2.createHash('blake2b', { digestLength: 64 }).update(Buffer.from(message)).digest("base64");
    await _sodium.ready;
    const sodium = _sodium;
    const digest = sodium.crypto_generichash(64, sodium.from_string(message));
    const digest_base64 = sodium.to_base64(digest, base64_variants.ORIGINAL);
    const signing_string =
        `(created): ${created}
(expires): ${expires}
digest: BLAKE-512=${digest_base64}`
    return { signing_string, expires, created }
}

export const signMessage = async (signing_string: string, privateKey: string) => {
    await _sodium.ready;
    const sodium = _sodium;
    const signedMessage = sodium.crypto_sign_detached(signing_string, sodium.from_base64(privateKey, base64_variants.ORIGINAL));
    return sodium.to_base64(signedMessage, base64_variants.ORIGINAL);
}

export const createAuthorizationHeader = async (message: any) => {
    const { signing_string, expires, created } = await createSigningString(JSON.stringify(message));
    console.log(message?.context?.transaction_id, "Signing string: ", signing_string);
    const signature = await signMessage(signing_string, process.env.sign_private_key || "");
    const subscriber_id = config.bpp_id;
    const header = `Signature keyId="${subscriber_id}|${config.unique_key_id}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`
    return header;
}


export const verifyMessage = async (signedString: string, signingString: string, publicKey: string) => {
    try {
        await _sodium.ready;
        const sodium = _sodium;
        return sodium.crypto_sign_verify_detached(sodium.from_base64(signedString, base64_variants.ORIGINAL), signingString, sodium.from_base64(publicKey, base64_variants.ORIGINAL));
    } catch (error) {
        console.log(error);
        return false
    }
}

const remove_quotes = (value: string) => {
    if (value.length >= 2 && value.charAt(0) == '"' && value.charAt(value.length - 1) == '"') {
        value = value.substring(1, value.length - 1)
    }
    return value;
}

const split_auth_header_space = (auth_header: string) => {
    const header = auth_header.replace('Signature ', '');
    let re = /\s*([^=]+)=\"([^"]+)"/g;
    let m;
    let parts: any = {}
    while ((m = re.exec(header)) !== null) {
        if (m) {
            parts[m[1]] = m[2];
        }
    }
    return parts;
}

const split_auth_header = (auth_header: string) => {
    const header = auth_header.replace('Signature ', '');
    let re = /\s*([^=]+)=([^,]+)[,]?/g;
    let m;
    let parts: any = {}
    while ((m = re.exec(header)) !== null) {
        if (m) {
            parts[m[1]] = remove_quotes(m[2]);
        }
    }
    return parts;
}

const verifyHeader = async (header: string, req: Request) => {
    try {
        const parts = split_auth_header(header);
        if (!parts || Object.keys(parts).length === 0) {
            throw (new Error("Header parsing failed"));
        }
        var [subscriber_id, unique_key_id] = parts['keyId'].split('|')
        const subscriber_details = await lookupRegistry(subscriber_id, unique_key_id)
        const public_key = subscriber_details.signing_public_key;
        const subscriber_url = subscriber_details.subscriber_url;
        const subscriber_type = subscriber_details.type.toLowerCase();
        req.subscriber_type = subscriber_type;
        req.subscriber_url = subscriber_url;
        console.log(req.body?.context?.transaction_id, "Received key:", public_key)
        const { signing_string } = await createSigningString(req.rawBody, parts['created'], parts['expires']);
        const verified = await verifyMessage(parts['signature'], signing_string, public_key);
        if (!verified) {
            const sub = await Subscribers.findByPk(parts['keyId'].split('|')[0]);
            if (sub) {
                sub.destroy();
            }
        }
        return verified;
    } catch (error) {
        console.log(req.body?.context?.transaction_id, (error as Error).message);
        return false;
    }
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log("\nNew Request txn_id", req.body?.context?.transaction_id);
        if (req.body?.context?.bap_id) {
            console.log(req.body?.context?.transaction_id, "Request from", req.body.context.bap_id)
        }
        const auth_header = req.headers['authorization'] || "";
        const proxy_header = req.headers['proxy-authorization'] || "";
        if (config.auth) {
            var verified = await verifyHeader(auth_header, req);
            var verified_proxy = proxy_header ? await verifyHeader(proxy_header, req) : true;
            console.log(req.body?.context?.transaction_id, "Verification status:", verified, "Proxy verification:", verified_proxy);
            if (!verified || !verified_proxy) {
                throw Error("Header verification failed");
            }
        }
        next();
    } catch (e) {
        console.log(req.body?.context?.transaction_id, (e as Error).message);
        res.status(401).send('Authentication failed');
    }
}

const lookupRegistry = async (subscriber_id: string, unique_key_id: string) => {
    const subscriber_details = await Subscribers.findByPk(subscriber_id);
    if (subscriber_details) {
        if (subscriber_details.valid_until > new Date()) {
            console.log("Found subscriber details in cache");
            return subscriber_details;
        } else {
            subscriber_details.destroy();
        }
    }
    try {
        const header = await createAuthorizationHeader({ subscriber_id });
        const axios_config = {
            headers: {
                Authorization: header
            }
        }

        console.log("Calling", combineURLs(config.registry_url, '/lookup'), { subscriber_id, unique_key_id })
        const response = await axios.post(combineURLs(config.registry_url, '/lookup'), { subscriber_id, unique_key_id });
        if (response.data) {
            if (response.data.length === 0) {
                throw (new Error("Subscriber not found"));
            }
            const { subscriber_id, subscriber_url, signing_public_key, type, valid_until } = response.data[0];
            Subscribers.create({ subscriber_id, subscriber_url, signing_public_key, type, valid_until });
        }
        return response.data[0];
    } catch (error) {
        console.log(error)
        console.log((error as Error).message);
        throw (new Error("Registry lookup error"))
    }
}

const getPublicKey = async (subscriber_id: string) => {
    try {
        const header = await createAuthorizationHeader({ subscriber_id });
        const axios_config = {
            headers: {
                Authorization: header
            }
        }
        const response = await axios.post(combineURLs(config.registry_url, '/lookup'), { subscriber_id }, axios_config);
        return response.data.signing_public_key;
    } catch (error) {
        console.log(error);
    }
}