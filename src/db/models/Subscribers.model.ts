import { Table, Column, Model, PrimaryKey } from 'sequelize-typescript';

@Table
export class Subscribers extends Model {
    @PrimaryKey
    @Column
    subscriber_id: string

    @Column
    subscriber_url: string

    @Column
    signing_public_key: string

    @Column
    type: string

    @Column
    valid_until: Date
}