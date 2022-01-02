import { Table, Column, Model, PrimaryKey, ForeignKey } from 'sequelize-typescript';
import { Calendar } from './Calendar.model';

@Table
export class Trips extends Model {
    @Column
    route_id: string

    @Column
    @ForeignKey(() => Calendar)
    service_id: string

    @PrimaryKey
    @Column
    trip_id: string

    @Column
    trip_headsign: string

    @Column
    direction_id: string

    @Column
    shape_id: string

    @Column
    zone_id: string

    @Column
    wheelchair_accessible: string
}