import { Injectable } from '@angular/core';
import { SeatType } from '../models/SeatType.model';

@Injectable({
  providedIn: 'root',
})
export class GenerateSeatsService {
  constructor() {}

  generateSeats(seatTypes: SeatType[]): any[] {
    const sections = [
      { name: 'Left Foyer', prefix: 'LF' },
      { name: 'Middle Foyer', prefix: 'MF' },
      { name: 'Right Foyer', prefix: 'RF' },
      { name: 'Left Balcony', prefix: 'LB' },
      { name: 'Middle Balcony', prefix: 'MB' },
      { name: 'Right Balcony', prefix: 'RB' },
    ];

    const rightFoyerLayout = { A: 8, B: 10, C: 11, D: 12, E: 12, F: 12, G: 12, H: 11, J: 10, K: 8, L: 5 };
    const middleFoyerLayout = {
      A: { start: 15, end: 33 }, B: { start: 15, end: 34 }, C: { start: 15, end: 33 }, D: { start: 15, end: 34 },
      E: { start: 15, end: 31 }, F: { start: 15, end: 32 }, G: { start: 15, end: 31 }, H: { start: 15, end: 32 },
      J: { start: 15, end: 29 }, K: { start: 15, end: 30 },
    };
    const middleBalconyLayout = {
      AA: { start: 15, end: 36 }, BB: { start: 15, end: 36 }, CC: { start: 15, end: 36 }, DD: { start: 15, end: 35 },
    };
    const rightBalconyLayout = { AA: 13, BB: 13, CC: 13, DD: 13, EE: 12 };

    const getSeatTypeForSection = (sectionName: string) => {
      return seatTypes.find(st => st.assignedSections.includes(sectionName));
    };

    const generateRow = (rowLetter: string, start: number, end: number, sectionName: string, typeName: string, price: number) => {
      const row: any = [];
      row.rowLetter = rowLetter;
      for (let j = end; j >= start; j--) {
        const seatNumber = `${rowLetter}-${j}`;
        row.push({ number: seatNumber, section: sectionName, selected: false, occupied: false, seatType: typeName, price: price });
      }
      return row;
    };

    sections.forEach((section: any) => {
      section.seatRows = [];
      const seatType = getSeatTypeForSection(section.name);
      const price = seatType ? seatType.price : 0;
      const typeName = seatType ? seatType.name : 'default';

      if (section.name === 'Right Foyer') {
        for (const rowLetter of Object.keys(rightFoyerLayout)) {
          const numSeats = rightFoyerLayout[rowLetter as keyof typeof rightFoyerLayout];
          section.seatRows.push(generateRow(rowLetter, 1, numSeats, section.name, typeName, price));
        }
      } else if (section.name === 'Middle Foyer') {
        for (const rowLetter of Object.keys(middleFoyerLayout)) {
          const layout = middleFoyerLayout[rowLetter as keyof typeof middleFoyerLayout];
          section.seatRows.push(generateRow(rowLetter, layout.start, layout.end, section.name, typeName, price));
        }
      } else if (section.name === 'Left Foyer') {
        for (const rowLetter of Object.keys(rightFoyerLayout)) {
          const numSeats = rightFoyerLayout[rowLetter as keyof typeof rightFoyerLayout];
          const startSeat = 36;
          const endSeat = startSeat + numSeats - 1;
          section.seatRows.push(generateRow(rowLetter, startSeat, endSeat, section.name, typeName, price));
        }
      } else if (section.name === 'Middle Balcony') {
        for (const rowLetter of Object.keys(middleBalconyLayout)) {
          const layout = middleBalconyLayout[rowLetter as keyof typeof middleBalconyLayout];
          section.seatRows.push(generateRow(rowLetter, layout.start, layout.end, section.name, typeName, price));
        }
      } else if (section.name === 'Right Balcony') {
        for (const rowLetter of Object.keys(rightBalconyLayout)) {
          const numSeats = rightBalconyLayout[rowLetter as keyof typeof rightBalconyLayout];
          section.seatRows.push(generateRow(rowLetter, 1, numSeats, section.name, typeName, price));
        }
      } else if (section.name === 'Left Balcony') {
        for (const rowLetter of Object.keys(rightBalconyLayout)) {
          const numSeats = rightBalconyLayout[rowLetter as keyof typeof rightBalconyLayout];
          const startSeat = 37;
          const endSeat = startSeat + numSeats - 1;
          section.seatRows.push(generateRow(rowLetter, startSeat, endSeat, section.name, typeName, price));
        }
      }
    });

    return sections;
  }
}
