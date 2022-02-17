import { Table, Column, Model, PrimaryKey, IsIn } from 'sequelize-typescript';

@Table
export class Agency extends Model {
    @PrimaryKey
    @Column
    agency_id: string

    @Column
    agency_name: string

    @Column
    agency_url: string

    @Column
    agency_timezone: string
}