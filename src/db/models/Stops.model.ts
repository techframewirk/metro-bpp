import { Table, Column, Model, PrimaryKey } from 'sequelize-typescript';

@Table
export class Stops extends Model {
    @PrimaryKey
    @Column
    stop_id: string

    @Column
    stop_name: string

    @Column
    stop_lat: string

    @Column
    stop_lon: string

    @Column
    zone_id: string

    @Column
    wheelchair_boarding: string
}