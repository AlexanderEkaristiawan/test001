import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class EventCards{
  data = [
      { 
        id: 1,
        picture:'https://picsum.photos/id/11/200/100',
        title: 'Comic Con 2025',
        description: 'Date : 18 / 08 / 2025',
      },

      {
        id: 2,
        picture:'https://picsum.photos/id/11/200/100',
        title: 'Star Wars : Meet and Greet',
        description: 'Date : 09 / 11 / 2025',
      },

      {
        id: 3,
        picture:'https://picsum.photos/id/11/200/100',
        title: 'Symphony Orchestra',
        description: 'Date : 24 / 02 / 2025',
      },
      
      
  ];
}
